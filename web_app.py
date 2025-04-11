#!/usr/bin/env python3
"""
Веб-версия приложения OpenCV Filters на FastAPI.
Позволяет загружать изображения и применять фильтры через браузер.
Включает сбор статистики и логирование в БД aiosqlite.
"""

import os
import io
import uuid
import base64
import logging
import uvicorn
import numpy as np
import cv2
import time
import json
from typing import List, Dict, Union, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, Cookie, Depends, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from PIL import Image
from typing import List, Dict, Union, Optional, Any


import filters
from filter_category import FilterCategory
from logger import logger


import stats_db

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
RESULT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)

app = FastAPI(
    title="OpenCV Filters Web",
    description="Веб-версия приложения для обработки изображений с использованием OpenCV фильтров",
    version="1.0.0"
)

# Настройка статических файлов
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Настройка шаблонов
templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
os.makedirs(templates_dir, exist_ok=True)
templates = Jinja2Templates(directory=templates_dir)


# Модели данных
class FilterParam(BaseModel):
    """Модель параметра фильтра"""
    name: str
    value: Union[int, float, str]


class FilterRequest(BaseModel):
    """Модель запроса на применение фильтра"""
    filter_name: str
    filter_category: str
    params: Optional[List[FilterParam]] = None


class FilterResponse(BaseModel):
    """Модель ответа с результатом применения фильтра"""
    success: bool
    message: str
    image_data: Optional[str] = None
    error: Optional[str] = None


# Словарь для хранения загруженных изображений в памяти (id -> image)
images_store = {}


# Событие запуска приложения
@app.on_event("startup")
async def startup_event():
    """Выполняется при запуске приложения."""
    # Инициализация базы данных
    await stats_db.init_db()

    # Логируем запуск приложения
    await stats_db.log_app_event("app_start", description="Веб-приложение запущено")

    logger.info("Веб-приложение запущено")


# Событие завершения работы приложения
@app.on_event("shutdown")
async def shutdown_event():
    """Выполняется при завершении работы приложения."""
    # Логируем завершение работы приложения
    await stats_db.log_app_event("app_shutdown", description="Веб-приложение завершено")

    logger.info("Веб-приложение завершило работу")


# Зависимость для управления сессиями
async def get_session_id(request: Request, session_id: Optional[str] = Cookie(None), response: Response = None):
    """
    Получает или создает ID сессии пользователя.

    Args:
        request: Объект запроса
        session_id: ID сессии из cookie
        response: Объект ответа

    Returns:
        str: ID сессии
    """
    if not session_id:
        # Создаем новую сессию
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        session_id = await stats_db.create_session(ip_address, user_agent)

        # Устанавливаем cookie
        if response and session_id:
            response.set_cookie(key="session_id", value=session_id, max_age=3600 * 24 * 30)  # 30 дней

    return session_id


# Функция для получения всех категорий и фильтров
def get_all_filters() -> Dict:
    """
    Получает все доступные фильтры, организованные по категориям.
    """
    result = {}

    # Для каждой категории фильтров
    for category in FilterCategory.get_all():
        # Получаем все фильтры этой категории
        category_filters = []

        # Различные категории имеют разные наборы фильтров
        if category == FilterCategory.BLUR:
            category_filters = [
                "Размытие по Гауссу", "Медианный фильтр", "Двустороннее размытие",
                "Размытие среднего", "Размытие по Блоку", "Фильтр Собеля",
                "Фильтр Лапласа", "Размытие по Стэку", "Фильтр НЧМ (Нижних частот)"
            ]
        elif category == FilterCategory.EDGES:
            category_filters = [
                "Canny", "Собель X", "Собель Y", "Собель XY", "Лаплас",
                "Scharr X", "Scharr Y", "Scharr XY", "Детектор углов Харриса",
                "Детектор углов Ши-Томаси", "Выделение контуров"
            ]
        elif category == FilterCategory.COLOR:
            category_filters = [
                "Оттенки серого", "Сепия", "HSV", "LAB", "YCrCb", "Негатив",
                "Изменение насыщенности", "Изменение оттенка", "Повышение контраста CLAHE",
                "Псевдоцвета (Jet)", "Псевдоцвета (Hot)", "Псевдоцвета (Cool)",
                "Изменение баланса RGB"
            ]
        elif category == FilterCategory.MORPHOLOGY:
            category_filters = [
                "Эрозия", "Дилатация", "Открытие", "Закрытие", "Градиент",
                "Верхняя шляпа", "Черная шляпа", "Скелетизация", "Утончение"
            ]
        elif category == FilterCategory.TRANSFORM:
            category_filters = [
                "Масштабирование", "Поворот", "Отражение", "Сдвиг",
                "Перспективное преобразование", "Аффинное преобразование",
                "Коррекция перспективы"
            ]
        elif category == FilterCategory.ENHANCEMENT:
            category_filters = [
                "Гамма-коррекция", "Яркость/Контраст", "Автоматический баланс белого",
                "Автоконтраст", "Поиск и удаление шума", "Повышение резкости",
                "Детализация", "HDR-эффект", "Выравнивание гистограммы"
            ]
        elif category == FilterCategory.SEGMENTATION:
            category_filters = [
                "Бинаризация (пороговая)", "Адаптивный порог", "Порог Отсу",
                "Водораздел", "Mean Shift", "K-Means", "GrabCut", "Детектор движений"
            ]
        elif category == FilterCategory.FEATURE:
            category_filters = [
                "SIFT-дескриптор", "SURF-дескриптор", "ORB-дескриптор",
                "HOG-дескриптор", "Детектор лиц Haar Cascade", "Детектор глаз Haar Cascade",
                "Выделение линий Хафа", "Выделение окружностей Хафа"
            ]
        elif category == FilterCategory.CUSTOM:
            category_filters = [
                "Карта глубины", "Мультиплексирование каналов", "Картунизация (Cartoon-эффект)",
                "Пикселизация", "Виньетка", "Размытие в движении", "Акварельный эффект",
                "Эффект масляной живописи", "Стилизация под карандашный рисунок"
            ]

        result[category] = category_filters

    return result


# Функция для применения фильтра к изображению
async def apply_filter(image, filter_name, filter_category, params=None, session_id=None):
    """
    Применяет выбранный фильтр к изображению с заданными параметрами.

    Args:
        image: OpenCV изображение
        filter_name: Имя фильтра
        filter_category: Категория фильтра
        params: Словарь параметров фильтра
        session_id: ID сессии для логирования

    Returns:
        Изображение с примененным фильтром
    """
    try:
        logger.info(f"Применение фильтра {filter_name} из категории {filter_category}")

        # Засекаем время начала выполнения
        start_time = time.time()
        success = True

        # Если параметры не переданы, используем пустой словарь
        if params is None:
            params = {}

        # Преобразуем список параметров в словарь
        if isinstance(params, list):
            params_dict = {param.name: param.value for param in params}
        else:
            params_dict = params

        # Получаем функцию фильтра в зависимости от имени и категории
        result_image = None

        # Размытие и сглаживание
        if filter_category == FilterCategory.BLUR:
            if filter_name == "Размытие по Гауссу":
                ksize_x = int(params_dict.get("ksize_x", 5))
                ksize_y = int(params_dict.get("ksize_y", 5))
                sigma = float(params_dict.get("sigma", 0))
                result_image = filters.apply_gaussian_blur(image, (ksize_x, ksize_y), sigma)
            elif filter_name == "Медианный фильтр":
                ksize = int(params_dict.get("ksize", 5))
                result_image = filters.apply_median_blur(image, ksize)
            elif filter_name == "Двустороннее размытие":
                d = int(params_dict.get("d", 9))
                sigma_color = float(params_dict.get("sigma_color", 75))
                sigma_space = float(params_dict.get("sigma_space", 75))
                result_image = filters.apply_bilateral_filter(image, d, sigma_color, sigma_space)
            elif filter_name == "Размытие среднего":
                ksize_x = int(params_dict.get("ksize_x", 5))
                ksize_y = int(params_dict.get("ksize_y", 5))
                result_image = filters.apply_blur(image, (ksize_x, ksize_y))
            elif filter_name == "Размытие по Блоку":
                ksize_x = int(params_dict.get("ksize_x", 5))
                ksize_y = int(params_dict.get("ksize_y", 5))
                result_image = filters.apply_box_filter(image, (ksize_x, ksize_y))
            elif filter_name == "Фильтр Собеля":
                dx = int(params_dict.get("dx", 1))
                dy = int(params_dict.get("dy", 1))
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_sobel(image, dx, dy, ksize)
            elif filter_name == "Фильтр Лапласа":
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_laplacian(image, ksize)
            elif filter_name == "Размытие по Стэку":
                ksize_x = int(params_dict.get("ksize_x", 21))
                ksize_y = int(params_dict.get("ksize_y", 21))
                result_image = filters.apply_stack_blur(image, (ksize_x, ksize_y))
            elif filter_name == "Фильтр НЧМ (Нижних частот)":
                cutoff = float(params_dict.get("cutoff", 30))
                result_image = filters.apply_lowpass_filter(image, cutoff)

        # Обнаружение краев и контуров
        elif filter_category == FilterCategory.EDGES:
            if filter_name == "Canny":
                threshold1 = float(params_dict.get("threshold1", 100))
                threshold2 = float(params_dict.get("threshold2", 200))
                result_image = filters.apply_canny_edge(image, threshold1, threshold2)
            elif filter_name == "Собель X":
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_sobel_x(image, ksize)
            elif filter_name == "Собель Y":
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_sobel_y(image, ksize)
            elif filter_name == "Собель XY":
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_sobel_xy(image, ksize)
            elif filter_name == "Лаплас":
                ksize = int(params_dict.get("ksize", 3))
                result_image = filters.apply_laplacian(image, ksize)
            elif filter_name == "Scharr X":
                result_image = filters.apply_scharr_x(image)
            elif filter_name == "Scharr Y":
                result_image = filters.apply_scharr_y(image)
            elif filter_name == "Scharr XY":
                result_image = filters.apply_scharr_xy(image)
            elif filter_name == "Детектор углов Харриса":
                block_size = int(params_dict.get("block_size", 2))
                ksize = int(params_dict.get("ksize", 3))
                k = float(params_dict.get("k", 0.04))
                result_image = filters.apply_harris_corner(image, block_size, ksize, k)
            elif filter_name == "Детектор углов Ши-Томаси":
                max_corners = int(params_dict.get("max_corners", 100))
                quality_level = float(params_dict.get("quality_level", 0.01))
                min_distance = float(params_dict.get("min_distance", 10))
                result_image = filters.apply_shi_tomasi(image, max_corners, quality_level, min_distance)
            elif filter_name == "Выделение контуров":
                threshold1 = float(params_dict.get("threshold1", 100))
                threshold2 = float(params_dict.get("threshold2", 200))
                mode = cv2.RETR_TREE  # Упрощаем для веб-версии
                method = cv2.CHAIN_APPROX_SIMPLE
                result_image = filters.apply_find_contours(image, mode, method, threshold1, threshold2)

        # Цветовые преобразования
        elif filter_category == FilterCategory.COLOR:
            if filter_name == "Оттенки серого":
                result_image = filters.apply_grayscale(image)
            elif filter_name == "Сепия":
                intensity = float(params_dict.get("intensity", 1.0))
                result_image = filters.apply_sepia(image, intensity)
            elif filter_name == "HSV":
                result_image = filters.apply_hsv(image)
            elif filter_name == "LAB":
                result_image = filters.apply_lab(image)
            elif filter_name == "YCrCb":
                result_image = filters.apply_ycrcb(image)
            elif filter_name == "Негатив":
                result_image = filters.apply_negative(image)
            elif filter_name == "Изменение насыщенности":
                scale = float(params_dict.get("scale", 1.5))
                result_image = filters.apply_saturation(image, scale)
            elif filter_name == "Изменение оттенка":
                shift = int(params_dict.get("shift", 10))
                result_image = filters.apply_hue_shift(image, shift)
            elif filter_name == "Повышение контраста CLAHE":
                clip_limit = float(params_dict.get("clip_limit", 2.0))
                tile_grid_size = int(params_dict.get("tile_grid_size", 8))
                result_image = filters.apply_clahe(image, clip_limit, tile_grid_size)
            elif filter_name == "Псевдоцвета (Jet)":
                result_image = filters.apply_colormap_jet(image)
            elif filter_name == "Псевдоцвета (Hot)":
                result_image = filters.apply_colormap_hot(image)
            elif filter_name == "Псевдоцвета (Cool)":
                result_image = filters.apply_colormap_cool(image)
            elif filter_name == "Изменение баланса RGB":
                r_scale = float(params_dict.get("r_scale", 1.0))
                g_scale = float(params_dict.get("g_scale", 1.0))
                b_scale = float(params_dict.get("b_scale", 1.0))
                result_image = filters.apply_rgb_balance(image, r_scale, g_scale, b_scale)

        # Морфологические операции
        elif filter_category == FilterCategory.MORPHOLOGY:
            if filter_name == "Эрозия":
                ksize = int(params_dict.get("ksize", 5))
                iterations = int(params_dict.get("iterations", 1))
                result_image = filters.apply_erosion(image, ksize, iterations)
            elif filter_name == "Дилатация":
                ksize = int(params_dict.get("ksize", 5))
                iterations = int(params_dict.get("iterations", 1))
                result_image = filters.apply_dilation(image, ksize, iterations)
            elif filter_name == "Открытие":
                ksize = int(params_dict.get("ksize", 5))
                iterations = int(params_dict.get("iterations", 1))
                result_image = filters.apply_opening(image, ksize, iterations)
            elif filter_name == "Закрытие":
                ksize = int(params_dict.get("ksize", 5))
                iterations = int(params_dict.get("iterations", 1))
                result_image = filters.apply_closing(image, ksize, iterations)
            elif filter_name == "Градиент":
                ksize = int(params_dict.get("ksize", 5))
                result_image = filters.apply_morph_gradient(image, ksize)
            elif filter_name == "Верхняя шляпа":
                ksize = int(params_dict.get("ksize", 5))
                result_image = filters.apply_tophat(image, ksize)
            elif filter_name == "Черная шляпа":
                ksize = int(params_dict.get("ksize", 5))
                result_image = filters.apply_blackhat(image, ksize)
            elif filter_name == "Скелетизация" or filter_name == "Утончение":
                iterations = int(params_dict.get("iterations", 10))
                result_image = filters.apply_skeleton(image, iterations)

        # Геометрические преобразования
        elif filter_category == FilterCategory.TRANSFORM:
            if filter_name == "Масштабирование":
                scale = float(params_dict.get("scale", 1.0))
                result_image = filters.apply_resize(image, scale)
            elif filter_name == "Поворот":
                angle = float(params_dict.get("angle", 0))
                result_image = filters.apply_rotate(image, angle)
            elif filter_name == "Отражение":
                mode = params_dict.get("mode", "Горизонтально")
                result_image = filters.apply_flip(image, mode)
            elif filter_name == "Сдвиг":
                x_shift = int(params_dict.get("x_shift", 0))
                y_shift = int(params_dict.get("y_shift", 0))
                result_image = filters.apply_translate(image, x_shift, y_shift)
            else:
                # Для других трансформаций просто возвращаем исходное изображение
                result_image = image.copy()

        # Улучшение изображения
        elif filter_category == FilterCategory.ENHANCEMENT:
            if filter_name == "Гамма-коррекция":
                gamma = float(params_dict.get("gamma", 1.0))
                result_image = filters.apply_gamma_correction(image, gamma)
            elif filter_name == "Яркость/Контраст":
                brightness = int(params_dict.get("brightness", 0))
                contrast = int(params_dict.get("contrast", 0))
                result_image = filters.apply_brightness_contrast(image, brightness, contrast)
            elif filter_name == "Автоматический баланс белого":
                result_image = filters.apply_auto_white_balance(image)
            elif filter_name == "Автоконтраст":
                result_image = filters.apply_auto_contrast(image)
            elif filter_name == "Поиск и удаление шума":
                result_image = filters.apply_denoise(image)
            elif filter_name == "Повышение резкости":
                result_image = filters.apply_sharpen(image)
            elif filter_name == "Детализация":
                result_image = filters.apply_detail(image)
            elif filter_name == "HDR-эффект":
                result_image = filters.apply_hdr(image)
            elif filter_name == "Выравнивание гистограммы":
                result_image = filters.apply_histogram_equalization(image)

        # Сегментация и пороги
        elif filter_category == FilterCategory.SEGMENTATION:
            if filter_name == "Бинаризация (пороговая)":
                thresh = int(params_dict.get("thresh", 127))
                result_image = filters.apply_threshold(image, thresh)
            elif filter_name == "Адаптивный порог":
                block_size = int(params_dict.get("block_size", 11))
                C = int(params_dict.get("C", 2))
                result_image = filters.apply_adaptive_threshold(image, block_size, C)
            elif filter_name == "Порог Отсу":
                result_image = filters.apply_otsu_threshold(image)
            elif filter_name == "Mean Shift":
                result_image = filters.apply_mean_shift(image)
            elif filter_name == "K-Means":
                K = int(params_dict.get("K", 4))
                result_image = filters.apply_kmeans(image, K)
            elif filter_name == "GrabCut":
                result_image = filters.apply_grabcut(image)
            else:
                # Другие варианты сегментации
                result_image = image.copy()

        # Выделение признаков
        elif filter_category == FilterCategory.FEATURE:
            if filter_name == "SIFT-дескриптор":
                result_image = filters.apply_sift(image)
            elif filter_name == "SURF-дескриптор" or filter_name == "ORB-дескриптор":
                result_image = filters.apply_orb(image)
            elif filter_name == "Выделение линий Хафа":
                result_image = filters.apply_hough_lines(image)
            elif filter_name == "Выделение окружностей Хафа":
                result_image = filters.apply_hough_circles(image)
            else:
                # Другие варианты выделения признаков
                result_image = image.copy()

        # Пользовательские фильтры
        elif filter_category == FilterCategory.CUSTOM:
            if filter_name == "Картунизация (Cartoon-эффект)":
                result_image = filters.apply_cartoon(image)
            elif filter_name == "Пикселизация":
                block_size = int(params_dict.get("block_size", 10))
                result_image = filters.apply_pixelation(image, block_size)
            elif filter_name == "Виньетка":
                result_image = filters.apply_vignette(image)
            elif filter_name == "Размытие в движении":
                kernel_size = int(params_dict.get("kernel_size", 15))
                result_image = filters.apply_motion_blur(image, kernel_size)
            elif filter_name == "Акварельный эффект":
                result_image = filters.apply_watercolor(image)
            elif filter_name == "Стилизация под карандашный рисунок":
                result_image = filters.apply_pencil_sketch(image)
            else:
                # Другие пользовательские фильтры
                result_image = image.copy()

        # Если фильтр не найден, возвращаем исходное изображение
        if result_image is None:
            logger.warning(f"Фильтр {filter_name} в категории {filter_category} не реализован для веб-версии")
            result_image = image.copy()
            success = False

        # Вычисляем время выполнения
        execution_time = (time.time() - start_time) * 1000  # в миллисекундах

        # Логируем использование фильтра, если задан session_id
        if session_id:
            await stats_db.log_filter_usage(
                session_id,
                filter_name,
                filter_category,
                params_dict,
                execution_time,
                success
            )

        return result_image

    except Exception as e:
        logger.error(f"Ошибка при применении фильтра {filter_name}: {e}")

        # Логируем ошибку
        if session_id:
            await stats_db.log_filter_usage(
                session_id,
                filter_name,
                filter_category,
                params_dict if 'params_dict' in locals() else None,
                (time.time() - start_time) * 1000 if 'start_time' in locals() else 0,
                False
            )
            await stats_db.log_app_event("filter_error", session_id,
                                         f"Ошибка при применении фильтра {filter_name}: {e}")

        # Возвращаем исходное изображение в случае ошибки
        return image


# Маршруты FastAPI

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request, session_id: str = Depends(get_session_id)):
    """Главная страница приложения"""
    return templates.TemplateResponse("index.html", {"request": request, "session_id": session_id})


@app.get("/stats", response_class=HTMLResponse)
async def get_stats(request: Request, session_id: str = Depends(get_session_id)):
    """Страница статистики"""
    # Получаем статистику использования фильтров
    filter_stats = await stats_db.get_filter_stats()

    # Получаем общую статистику приложения
    app_stats = await stats_db.get_app_stats()

    return templates.TemplateResponse(
        "stats.html",
        {
            "request": request,
            "session_id": session_id,
            "filter_stats": filter_stats,
            "app_stats": app_stats
        }
    )


@app.get("/filters")
async def get_filters():
    """Получение списка всех доступных фильтров"""
    return JSONResponse(content=get_all_filters())


@app.post("/upload")
async def upload_image(
        file: UploadFile = File(...),
        session_id: str = Depends(get_session_id)
):
    """Загрузка изображения на сервер"""
    try:
        start_time = time.time()
        content = await file.read()

        # Генерируем уникальный ID для изображения
        image_id = str(uuid.uuid4())

        # Сохраняем изображение на диск
        file_path = os.path.join(UPLOAD_DIR, f"{image_id}.jpg")
        with open(file_path, "wb") as f:
            f.write(content)

        # Читаем изображение с помощью OpenCV
        image = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)

        # Сохраняем изображение в памяти
        images_store[image_id] = image

        # Получаем информацию об изображении
        height, width = image.shape[:2]
        channels = image.shape[2] if len(image.shape) > 2 else 1
        file_size_kb = len(content) / 1024  # Размер в КБ

        # Логируем информацию об изображении
        await stats_db.log_image_processing(
            session_id,
            image_id,
            file.filename,
            width,
            height,
            channels,
            file_size_kb,
            processing_time=(time.time() - start_time) * 1000
        )

        # Логируем событие загрузки изображения
        await stats_db.log_app_event(
            "image_upload",
            session_id,
            f"Загружено изображение: {file.filename}, {width}x{height}, {channels} каналов"
        )

        # Конвертируем изображение в Base64 для отображения в браузере
        _, buffer = cv2.imencode('.jpg', image)
        image_base64 = base64.b64encode(buffer).decode('utf-8')

        logger.info(f"Изображение загружено: {image_id}, размер: {width}x{height}")

        return {
            "success": True,
            "message": "Изображение успешно загружено",
            "image_id": image_id,
            "width": width,
            "height": height,
            "channels": channels,
            "image_data": f"data:image/jpeg;base64,{image_base64}"
        }

    except Exception as e:
        logger.error(f"Ошибка при загрузке изображения: {e}")
        # Логируем ошибку
        await stats_db.log_app_event("image_upload_error", session_id, f"Ошибка при загрузке изображения: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при загрузке изображения: {str(e)}")


@app.post("/apply_filter/{image_id}")
async def apply_filter_endpoint(
        image_id: str,
        filter_request: FilterRequest,
        session_id: str = Depends(get_session_id)
):
    """Применение фильтра к изображению"""
    try:
        # Проверяем наличие исходного изображения
        if image_id not in images_store:
            # Логируем ошибку
            await stats_db.log_app_event(
                "filter_error",
                session_id,
                f"Изображение {image_id} не найдено при попытке применить фильтр {filter_request.filter_name}"
            )
            return FilterResponse(
                success=False,
                message="Изображение не найдено",
                error="Image not found"
            )

        # Проверяем, есть ли уже промежуточные результаты обработки для этого изображения
        # Ищем результат, который начинается с image_id и содержит самую длинную строку (т.е. последний результат)
        current_result_id = image_id
        for key in images_store.keys():
            if key.startswith(image_id + "_") and len(key) > len(current_result_id):
                current_result_id = key

        # Получаем текущее изображение (либо исходное, либо последний результат обработки)
        image = images_store[current_result_id].copy()

        # Логируем начало применения фильтра
        logger.info(f"Начало применения фильтра {filter_request.filter_name} к изображению {current_result_id}")

        # Применяем фильтр
        start_time = time.time()
        filtered_image = await apply_filter(
            image,
            filter_request.filter_name,
            filter_request.filter_category,
            filter_request.params,
            session_id
        )
        processing_time = (time.time() - start_time) * 1000  # в миллисекундах

        # Создаем безопасное имя для файла (только ASCII символы)
        filter_name_safe = ''.join(
            c for c in filter_request.filter_name if c.isalnum() or c in ' _-'
        ).rstrip()

        # Если имя пустое, используем просто 'filter'
        if not filter_name_safe:
            filter_name_safe = 'filter'

        # Сохраняем результат в памяти с новым идентификатором
        # (используем базовый ID изображения и добавляем все примененные фильтры)
        if current_result_id == image_id:
            result_id = f"{image_id}_{filter_name_safe}"
        else:
            # Если уже есть примененные фильтры, добавляем новый
            result_id = f"{current_result_id}_{filter_name_safe}"

        images_store[result_id] = filtered_image

        # Сохраняем изображение на диск
        result_path = os.path.join(RESULT_DIR, f"{result_id}.jpg")
        cv2.imwrite(result_path, filtered_image)

        # Конвертируем изображение в Base64 для отображения в браузере
        _, buffer = cv2.imencode('.jpg', filtered_image)
        image_base64 = base64.b64encode(buffer).decode('utf-8')

        # Логируем окончание применения фильтра
        logger.info(f"Фильтр {filter_request.filter_name} успешно применен к изображению {current_result_id}")
        logger.info(f"Новый результат сохранен как {result_id}")

        return FilterResponse(
            success=True,
            message=f"Фильтр {filter_request.filter_name} успешно применен",
            image_data=f"data:image/jpeg;base64,{image_base64}"
        )

    except Exception as e:
        logger.error(f"Ошибка при применении фильтра: {e}")
        # Логируем ошибку
        await stats_db.log_app_event(
            "filter_error",
            session_id,
            f"Ошибка при применении фильтра {filter_request.filter_name}: {e}"
        )
        return FilterResponse(
            success=False,
            message="Ошибка при применении фильтра",
            error=str(e)
        )

@app.delete("/images/{image_id}")
async def delete_image(
        image_id: str,
        session_id: str = Depends(get_session_id)
):
    """Удаление изображения из памяти сервера"""
    try:
        if image_id in images_store:
            del images_store[image_id]
            file_path = os.path.join(UPLOAD_DIR, f"{image_id}.jpg")
            if os.path.exists(file_path):
                os.remove(file_path)

            await stats_db.log_app_event(
                "image_delete",
                session_id,
                f"Изображение {image_id} удалено"
            )

            logger.info(f"Изображение {image_id} удалено")

            return {"success": True, "message": "Изображение успешно удалено"}
        else:
            return {"success": False, "message": "Изображение не найдено"}

    except Exception as e:
        logger.error(f"Ошибка при удалении изображения: {e}")
        # Логируем ошибку
        await stats_db.log_app_event(
            "image_delete_error",
            session_id,
            f"Ошибка при удалении изображения {image_id}: {e}"
        )
        raise HTTPException(status_code=500, detail=f"Ошибка при удалении изображения: {str(e)}")


@app.get("/session/end")
async def end_current_session(
        session_id: str = Depends(get_session_id),
        response: Response = None
):
    """Завершает текущую сессию пользователя"""
    try:
        await stats_db.end_session(session_id)

        # Удаляем cookie сессии
        if response:
            response.delete_cookie(key="session_id")

        return {"success": True, "message": "Сессия успешно завершена"}
    except Exception as e:
        logger.error(f"Ошибка при завершении сессии: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при завершении сессии: {str(e)}")


@app.get("/api/stats")
async def get_api_stats(session_id: str = Depends(get_session_id)):
    """Возвращает статистику в формате JSON для API"""
    try:
        # Получаем статистику использования фильтров
        filter_stats = await stats_db.get_filter_stats()

        # Получаем общую статистику приложения
        app_stats = await stats_db.get_app_stats()

        return {
            "success": True,
            "filter_stats": filter_stats,
            "app_stats": app_stats
        }
    except Exception as e:
        logger.error(f"Ошибка при получении статистики API: {e}")
        return {
            "success": False,
            "error": str(e)
        }


# Модели данных для пресетов
class PresetCreate(BaseModel):
    """Модель для создания пресета"""
    preset_name: str
    filters_data: List[Dict[str, Any]]


class PresetUpdate(BaseModel):
    """Модель для обновления пресета"""
    preset_name: Optional[str] = None
    filters_data: Optional[List[Dict[str, Any]]] = None


class PresetResponse(BaseModel):
    """Модель ответа с данными пресета"""
    success: bool
    message: str
    preset_id: Optional[str] = None
    preset_name: Optional[str] = None
    filters_data: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    usage_count: Optional[int] = None


# API эндпоинты для работы с пресетами

@app.get("/presets")
async def get_presets(session_id: str = Depends(get_session_id)):
    try:
        presets = await stats_db.get_all_presets()
        return {
            "success": True,
            "message": "Пресеты успешно получены",
            "presets": presets
        }
    except Exception as e:
        logger.error(f"Ошибка при получении пресетов: {e}")
        return {
            "success": False,
            "message": f"Ошибка при получении пресетов: {str(e)}",
            "presets": []
        }


@app.post("/presets", response_model=PresetResponse)
async def create_preset(preset_data: PresetCreate):
    """Создает новый пресет"""
    try:
        preset_id = await stats_db.save_preset(
            preset_data.preset_name,
            preset_data.filters_data
        )

        if preset_id:
            return {
                "success": True,
                "message": "Пресет успешно создан",
                "preset_id": preset_id,
                "preset_name": preset_data.preset_name
            }
        else:
            return {
                "success": False,
                "message": "Не удалось создать пресет"
            }
    except Exception as e:
        logger.error(f"Ошибка при создании пресета: {e}")
        return {
            "success": False,
            "message": f"Ошибка при создании пресета: {str(e)}"
        }


@app.get("/presets/{preset_id}", response_model=PresetResponse)
async def get_preset(
        preset_id: str,
        session_id: str = Depends(get_session_id)
):
    """Получает пресет по ID"""
    try:
        preset = await stats_db.get_preset_by_id(preset_id)

        if preset:
            return {
                "success": True,
                "message": "Пресет успешно загружен",
                "preset_id": preset["preset_id"],
                "preset_name": preset["preset_name"],
                "filters_data": preset["filters_data"],
                "created_at": preset["created_at"],
                "updated_at": preset["updated_at"],
                "usage_count": preset["usage_count"]
            }
        else:
            return {
                "success": False,
                "message": "Пресет не найден"
            }
    except Exception as e:
        logger.error(f"Ошибка при получении пресета: {e}")
        return {
            "success": False,
            "message": f"Ошибка при получении пресета: {str(e)}"
        }


@app.put("/presets/{preset_id}", response_model=PresetResponse)
async def update_preset_endpoint(
        preset_id: str,
        preset_data: PresetUpdate,
        session_id: str = Depends(get_session_id)
):
    """Обновляет пресет"""
    try:
        success = await stats_db.update_preset(
            preset_id,
            preset_data.preset_name,
            preset_data.filters_data
        )

        if success:
            # Получаем обновленные данные
            updated_preset = await stats_db.get_preset_by_id(preset_id)

            return {
                "success": True,
                "message": "Пресет успешно обновлен",
                "preset_id": updated_preset["preset_id"],
                "preset_name": updated_preset["preset_name"],
                "filters_data": updated_preset["filters_data"],
                "created_at": updated_preset["created_at"],
                "updated_at": updated_preset["updated_at"],
                "usage_count": updated_preset["usage_count"]
            }
        else:
            return {
                "success": False,
                "message": "Не удалось обновить пресет"
            }
    except Exception as e:
        logger.error(f"Ошибка при обновлении пресета: {e}")
        return {
            "success": False,
            "message": f"Ошибка при обновлении пресета: {str(e)}"
        }


@app.delete("/presets/{preset_id}")
async def delete_preset_endpoint(
        preset_id: str,
        session_id: str = Depends(get_session_id)
):
    """Удаляет пресет"""
    try:
        success = await stats_db.delete_preset(preset_id)

        if success:
            return {
                "success": True,
                "message": "Пресет успешно удален"
            }
        else:
            return {
                "success": False,
                "message": "Пресет не найден или не удалось его удалить"
            }
    except Exception as e:
        logger.error(f"Ошибка при удалении пресета: {e}")
        return {
            "success": False,
            "message": f"Ошибка при удалении пресета: {str(e)}"
        }


# Запуск сервера если скрипт запущен напрямую
if __name__ == "__main__":
    uvicorn.run("web_app:app", host="0.0.0.0", port=8000, reload=True)