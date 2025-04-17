#!/usr/bin/env python3
"""
Скрипт для запуска веб-версии OpenCV Filters.
Проверяет зависимости, активирует виртуальное окружение и запускает веб-сервер.
"""

import os
import sys
import subprocess
import importlib
import webbrowser

VENV_DIR = "venv" if os.name == "nt" else "./venv"
VENV_ACTIVATE_WIN = os.path.join(VENV_DIR, "Scripts", "activate")
VENV_ACTIVATE_UNIX = os.path.join(VENV_DIR, "bin", "activate")

REQUIRED_DIRS = ['static', 'templates', 'uploads', 'results', 'logs']
REQUIRED_PACKAGES = [
    'fastapi', 'uvicorn', 'opencv-python', 'numpy',
    'python-multipart', 'jinja2', 'pillow', 'aiosqlite'
]


def check_dependencies():
    """Проверяет наличие необходимых библиотек"""
    missing_packages = []

    for package in REQUIRED_PACKAGES:
        try:
            importlib.import_module(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)

    return missing_packages


def install_dependencies(packages):
    """Устанавливает недостающие пакеты"""
    print("Установка недостающих зависимостей...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", *packages])
        print("Зависимости успешно установлены.")
        return True
    except subprocess.CalledProcessError:
        print("Не удалось установить зависимости. Попробуйте установить их вручную:")
        print(f"pip install {' '.join(packages)}")
        return False


def create_required_dirs():
    """Создает необходимые директории"""
    for directory in REQUIRED_DIRS:
        os.makedirs(directory, exist_ok=True)


def activate_virtualenv():
    """Активирует виртуальное окружение"""
    if sys.prefix != sys.base_prefix:
        print("Виртуальное окружение уже активно.")
        return True

    if os.name == "nt":
        activate_script = VENV_ACTIVATE_WIN
    else:
        activate_script = VENV_ACTIVATE_UNIX

    if os.path.exists(activate_script):
        print("Активируем виртуальное окружение...")
        subprocess.call([activate_script], shell=True)
        return True
    else:
        print("Виртуальное окружение не найдено. Создайте его командой 'python -m venv venv'")
        return False


def run_server():
    """Запускает веб-сервер"""
    print("Запуск веб-сервера...")
    print("Нажмите Ctrl+C для остановки сервера.")
    webbrowser.open("http://localhost:8000")
    try:
        subprocess.run([sys.executable, "-m", "uvicorn", "web_app:app", "--host", "0.0.0.0", "--port", "8000"])
    except KeyboardInterrupt:
        print("\nСервер остановлен.")


def main():
    print("Подготовка к запуску веб-версии OpenCV Filters...")

    if not activate_virtualenv():
        return

    """missing_packages = check_dependencies()
    if missing_packages:
        print(f"Отсутствуют следующие зависимости: {', '.join(missing_packages)}")
        install = input("Установить недостающие зависимости? (y/n): ").lower() == 'y'

        if install:
            success = install_dependencies(missing_packages)
            if not success:
                return
        else:
            print("Для работы веб-версии необходимо установить все зависимости.")
            return
    """

    create_required_dirs()
    run_server()


if __name__ == "__main__":
    main()
