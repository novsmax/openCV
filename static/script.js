let currentImageId = null;
let originalImageData = null;
let currentResultData = null;
let appliedFilters = []; // Будет обновляться при переключении между изображениями
let allFilters = {};
let sortableInstance = null;
let presetsList = [];
let currentPresetId = null;
let uploadedImages = []; // Массив со всеми загруженными изображениями { id, originalData, resultData, fileName, appliedFilters: [...] }
let currentImageIndex = 0;

// DOM-элементы
const archiveBtn = document.getElementById('downloadArchiveBtn');
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressBar = uploadProgress.querySelector('.progress-bar');
const uploadStatus = document.getElementById('uploadStatus');
const uploadedCountEl = document.getElementById('uploadedCount');
const totalCountEl = document.getElementById('totalCount');
const preview = document.getElementById('preview');
const imageInfo = document.getElementById('imageInfo');
const thumbnailsContainer = document.getElementById('thumbnailsContainer');
const filterCategory = document.getElementById('filterCategory');
const filterName = document.getElementById('filterName');
const filterParams = document.getElementById('filterParams');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');
const downloadBtn = document.getElementById('downloadBtn');
const compareBtn = document.getElementById('compareBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const processingContainer = document.getElementById('processingContainer');
const processingText = document.getElementById('processingText');
const batchProgressBar = document.getElementById('batchProgressBar');
const batchProgress = document.getElementById('batchProgress');
const processedCountEl = document.getElementById('processedCount');
const totalImagesEl = document.getElementById('totalImages');
const appliedFiltersContainer = document.getElementById('appliedFilters');
const filterSelectionTitle = document.getElementById('filterSelectionTitle');

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    await fetchFilters();
    await fetchUserPresets();
    setupEventListeners();
});

// Загрузка списка доступных фильтров
async function fetchFilters() {
    try {
        const response = await fetch('/filters');
        if (!response.ok) {
            throw new Error('Ошибка при загрузке фильтров');
        }

        allFilters = await response.json();

        filterCategory.innerHTML = '<option value="">Выберите категорию...</option>';
        Object.keys(allFilters).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            filterCategory.appendChild(option);
        });

        console.log('Фильтры успешно загружены');
    } catch (error) {
        console.error('Ошибка при загрузке фильтров:', error);
        alert('Не удалось загрузить список фильтров. Пожалуйста, обновите страницу.');
    }
}

// Загрузка пресетов пользователя
async function fetchUserPresets() {
    try {
        const response = await fetch('/presets');
        if (!response.ok) {
            throw new Error('Ошибка при загрузке пресетов');
        }

        const data = await response.json();
        if (data.success) {
            presetsList = data.presets;
            updatePresetsDropdown();
            console.log('Пресеты успешно загружены:', presetsList.length);
        } else {
            console.error('Ошибка при загрузке пресетов:', data.message);
        }
    } catch (error) {
        console.error('Ошибка при загрузке пресетов:', error);
    }
}

function updatePresetsDropdown() {
    const dropdown = document.getElementById('presetsDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">Выберите пресет...</option>';

    presetsList.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.preset_id;
        option.textContent = preset.preset_name;
        dropdown.appendChild(option);
    });

    const buttonsContainer = document.getElementById('presetButtonsContainer');
    if (buttonsContainer) {
        buttonsContainer.style.display = presetsList.length > 0 ? 'flex' : 'none';
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Drag and drop для загрузки изображения
    console.log('Инициализация обработчиков...');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
    dropArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Выбор фильтра
    filterCategory.addEventListener('change', handleCategoryChange);
    filterName.addEventListener('change', handleFilterChange);

    // Кнопки действий
    applyFilterBtn.addEventListener('click', applyFilter);
    cancelEditBtn.addEventListener('click', cancelEditing);
    resetBtn.addEventListener('click', resetImage);
    downloadBtn.addEventListener('click', downloadResult);
    compareBtn.addEventListener('click', toggleCompareMode);
    clearFiltersBtn.addEventListener('click', clearAllFilters);
    archiveBtn.addEventListener('click', handleArchiveDownload);

    // Обработчики для пресетов
    const presetsDropdown = document.getElementById('presetsDropdown');
    const applyPresetBtn = document.getElementById('applyPresetBtn');
    const savePresetBtn = document.getElementById('savePresetBtn');
    const updatePresetBtn = document.getElementById('updatePresetBtn');
    const deletePresetBtn = document.getElementById('deletePresetBtn');
    const savePresetModalBtn = document.getElementById('savePresetModalBtn');
    const closeModalBtns = document.getElementsByClassName('close-modal');
    const presetHeader = document.getElementById('presetHeader');
    const presetBody = document.getElementById('presetBody');
    const presetToggleIcon = document.getElementById('presetToggleIcon');

    if (presetHeader && presetBody) {
        presetHeader.addEventListener('click', function() {
            // Переключаем отображение содержимого
            if (presetBody.style.display === 'none') {
                presetBody.style.display = 'block';
                presetToggleIcon.classList.remove('fa-chevron-down');
                presetToggleIcon.classList.add('fa-chevron-up');
            } else {
                presetBody.style.display = 'none';
                presetToggleIcon.classList.remove('fa-chevron-up');
                presetToggleIcon.classList.add('fa-chevron-down');
            }
        });
    }

    if (presetsDropdown) presetsDropdown.addEventListener('change', () => {
        currentPresetId = presetsDropdown.value;
    });

    if (applyPresetBtn) applyPresetBtn.addEventListener('click', applyPreset);
    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', openSavePresetDialog);
        console.log('Обработчик сохранения привязан');
    } else {
        console.error('Кнопка "Сохранить" не найдена!');
    }
    if (updatePresetBtn) updatePresetBtn.addEventListener('click', updateCurrentPreset);
    if (deletePresetBtn) deletePresetBtn.addEventListener('click', deletePreset);
    if (savePresetModalBtn) savePresetModalBtn.addEventListener('click', savePreset);

    // Добавление обработчиков для закрытия модальных окон
    for (let i = 0; i < closeModalBtns.length; i++) {
        closeModalBtns[i].addEventListener('click', () => {
            const modalId = closeModalBtns[i].getAttribute('data-modal');
            closeModal(modalId);
        });
    }
}

async function clearAllFilters() {
    // Проверка
    if (appliedFilters.length === 0) {
        return;
    }

    // Запрос подтверждения
    if (!confirm('Вы уверены, что хотите удалить все примененные фильтры?')) {
        return;
    }

    // Сброс режима редактирования
    exitEditMode();

    // Очистка списка фильтров текущего изображения
    appliedFilters = [];
    uploadedImages[currentImageIndex].appliedFilters = [];

    await resetServerFilters();
    updateAppliedFiltersList();

    // Возвращаем исходное изображение
    preview.src = originalImageData;
    currentResultData = originalImageData;
    uploadedImages[currentImageIndex].resultData = originalImageData;
    updateThumbnailsContainer();

    // Отключение кнопок
    downloadBtn.disabled = true;
    compareBtn.disabled = true;
    clearFiltersBtn.disabled = true;

    console.log('Все фильтры удалены');
}

async function resetServerFilters() {
    if (!currentImageId) return;
    try {
        await fetch(`/reset_filters/${currentImageId}`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Ошибка при сбросе фильтров на сервере:', error);
    }
}

// Обновление текущего пресета
async function updateCurrentPreset() {
    if (!currentPresetId) {
        openSavePresetDialog();
        return;
    }
    if (appliedFilters.length === 0) {
        alert('Необходимо применить хотя бы один фильтр для обновления пресета');
        return;
    }

    if (!confirm('Вы уверены, что хотите обновить текущий пресет?')) {
        return;
    }

    try {
        processingContainer.style.display = 'block';
        processingText.textContent = `Обновление пресета...`;

        const response = await fetch(`/presets/${currentPresetId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filters_data: appliedFilters
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('Пресет успешно обновлен');
            await fetchUserPresets();
        } else {
            alert('Ошибка при обновлении пресета: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка при обновлении пресета:', error);
        alert('Ошибка при обновлении пресета');
    } finally {
        processingContainer.style.display = 'none';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

window.onclick = function(event) {
    const modals = document.getElementsByClassName('modal');
    for (let i = 0; i < modals.length; i++) {
        if (event.target === modals[i]) {
            modals[i].style.display = 'none';
        }
    }
}

async function applyPresetFilters(filters) {
    processingText.textContent = `Применение фильтров пресета...`;

    preview.src = originalImageData;
    currentResultData = originalImageData;

    // Очищаем текущие фильтры
    appliedFilters = [];
    uploadedImages[currentImageIndex].appliedFilters = [];

    // Сбрасываем фильтры на сервере перед применением новых
    await resetServerFilters();

    for (let i = 0; i < filters.length; i++) {
        const filter = filters[i];

        processingText.textContent = `Применение фильтра ${i+1} из ${filters.length}: ${filter.name}`;

        const response = await fetch(`/apply_filter/${currentImageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter_name: filter.name,
                filter_category: filter.category,
                params: filter.params
            })
        });

        const data = await response.json();

        if (data.success) {
            preview.src = data.image_data;
            currentResultData = data.image_data;

            // Добавляем фильтр в список применённых
            appliedFilters.push(filter);

            // Сохраняем изменения в массиве uploadedImages
            uploadedImages[currentImageIndex].appliedFilters = [...appliedFilters];
            uploadedImages[currentImageIndex].resultData = currentResultData;
        } else {
            alert('Ошибка при применении фильтра: ' + data.message);
            break;
        }
    }

    updateAppliedFiltersList();
    updateThumbnailsContainer();

    downloadBtn.disabled = false;
    compareBtn.disabled = false;
    clearFiltersBtn.disabled = appliedFilters.length === 0;
}

// Удаление пресета
async function deletePreset() {
    const dropdown = document.getElementById('presetsDropdown');
    const presetId = dropdown.value;

    if (!presetId) {
        alert('Пожалуйста, выберите пресет');
        return;
    }

    if (!confirm('Вы уверены, что хотите удалить этот пресет?')) {
        return;
    }

    try {
        processingContainer.style.display = 'block';
        processingText.textContent = `Удаление пресета...`;

        const response = await fetch(`/presets/${presetId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            console.log('Пресет успешно удален');

            if (currentPresetId === presetId) {
                currentPresetId = null;
            }

            await fetchUserPresets();
        } else {
            alert('Ошибка при удалении пресета: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка при удалении пресета:', error);
        alert('Ошибка при удалении пресета');
    } finally {
        processingContainer.style.display = 'none';
    }
}

function openSavePresetDialog() {
    console.log('Модальное окно открывается');
    if (appliedFilters.length === 0) {
        alert('Необходимо применить хотя бы один фильтр для создания пресета');
        return;
    }

    const modal = document.getElementById('savePresetModal');
    const presetNameInput = document.getElementById('presetNameInput');
    presetNameInput.value = `Пресет ${presetsList.length + 1}`;

    modal.style.display = 'block';
    presetNameInput.focus();
    console.log('Модальное окно:', modal);
}

// Сохранение пресета
async function savePreset() {
    const presetNameInput = document.getElementById('presetNameInput');
    const presetName = presetNameInput.value.trim();

    if (!presetName) {
        alert('Пожалуйста, введите название пресета');
        return;
    }

    if (appliedFilters.length === 0) {
        alert('Необходимо применить хотя бы один фильтр для создания пресета');
        return;
    }

    try {
        document.getElementById('savePresetModal').style.display = 'none';
        processingContainer.style.display = 'block';
        processingText.textContent = `Сохранение пресета: ${presetName}`;

        const response = await fetch('/presets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                preset_name: presetName,
                filters_data: appliedFilters
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('Пресет успешно сохранен:', data.preset_id);
            await fetchUserPresets();

            const dropdown = document.getElementById('presetsDropdown');
            if (dropdown) {
                dropdown.value = data.preset_id;
                currentPresetId = data.preset_id;
            }
        } else {
            alert('Ошибка при сохранении пресета: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка при сохранении пресета:', error);
        alert('Ошибка при сохранении пресета');
    } finally {
        processingContainer.style.display = 'none';
    }
}

// Применение выбранного пресета
async function applyPreset() {
    const dropdown = document.getElementById('presetsDropdown');
    const presetId = dropdown.value;

    if (!presetId) {
        alert('Пожалуйста, выберите пресет');
        return;
    }

    if (!currentImageId) {
        alert('Сначала загрузите изображение');
        return;
    }

    try {
        processingContainer.style.display = 'block';
        processingText.textContent = `Загрузка пресета...`;

        const response = await fetch(`/presets/${presetId}`);
        const data = await response.json();

        if (data.success) {
            console.log('Пресет успешно загружен:', data.preset_name);
            currentPresetId = presetId;
            await applyPresetFilters(data.filters_data);
            updateArchiveButton();
        } else {
            alert('Ошибка при загрузке пресета: ' + data.message);
        }
    } catch (error) {
        console.error('Ошибка при применении пресета:', error);
        alert('Ошибка при применении пресета');
    } finally {
        processingContainer.style.display = 'none';
    }
}

// Сброс всех изображений
function resetImage() {
    if (!confirm('Вы уверены, что хотите полностью сбросить ВСЕ изображения?')) return;

    // 1. Полный сброс всех данных
    uploadedImages = [];
    currentImageId = null;
    originalImageData = null;
    currentResultData = null;
    appliedFilters = [];
    currentImageIndex = 0;

    // 2. Сброс DOM-элементов
    preview.src = '/static/placeholder.jpg';
    imageInfo.style.display = 'none';

    // Сброс контейнера миниатюр
    if (thumbnailsContainer) {
        thumbnailsContainer.innerHTML = `
            <div class="text-center text-muted p-2">
                <i class="fas fa-images fa-2x mb-2"></i><br>
                Загрузите изображения
            </div>
        `;
        thumbnailsContainer.style.display = 'none';
    }

    // Изменяем класс контейнера основного изображения
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    if (imagePreviewContainer) {
        imagePreviewContainer.classList.remove('col-md-9');
        imagePreviewContainer.classList.add('col-12-mb-3');
    }

    // 3. Сброс элементов управления
    filterCategory.selectedIndex = 0;
    filterName.innerHTML = '<option value="">Сначала выберите категорию...</option>';
    filterParams.innerHTML = '';
    filterCategory.disabled = true;

    updateAppliedFiltersList();
    updateArchiveButton();

    downloadBtn.disabled = true;
    compareBtn.disabled = true;
    clearFiltersBtn.disabled = true;
    resetBtn.disabled = true;

    // 4. Принудительная очистка кэша
    URL.revokeObjectURL(preview.src);
    document.querySelectorAll('.thumbnail img').forEach(img => {
        URL.revokeObjectURL(img.src);
    });

    console.log('Полный сброс: все изображения и миниатюры удалены');
}

// Скачивание результата
async function downloadResult() {
    if (!currentResultData) {
        alert('Нет результата для скачивания');
        return;
    }

    // Создание ссылки для скачивания
    const a = document.createElement('a');
    a.href = currentResultData;
    a.download = 'opencv_filters_result.jpg';
    a.click();
}

// Переключение режима сравнения
let compareMode = false;
function toggleCompareMode() {
    compareMode = !compareMode;

    if (compareMode) {
        // Включение режима сравнения
        preview.src = originalImageData;
        compareBtn.innerHTML = '<i class="fas fa-eye me-2"></i>Показать результат';
    } else {
        // Выключение режима сравнения
        preview.src = currentResultData;
        compareBtn.innerHTML = '<i class="fas fa-columns me-2"></i>Сравнить';
    }
}

// Удаление фильтра из списка
function removeFilter(index) {
    // Проверяем, не редактируется ли этот фильтр
    if (applyFilterBtn.dataset.editIndex == index) {
        exitEditMode();
    }

    // Удаление фильтра
    appliedFilters.splice(index, 1);
    uploadedImages[currentImageIndex].appliedFilters = [...appliedFilters];

    // Обновление списка
    updateAppliedFiltersList();

    // Если фильтров не осталось, отключаем кнопки
    if (appliedFilters.length === 0) {
        downloadBtn.disabled = true;
        compareBtn.disabled = true;
        clearFiltersBtn.disabled = true;

        // Возвращаем исходное изображение
        preview.src = originalImageData;
        currentResultData = originalImageData;
        uploadedImages[currentImageIndex].resultData = originalImageData;

        resetServerFilters();
    } else {
        // Иначе применяем оставшиеся фильтры заново
        reapplyFilters();
    }

    updateArchiveButton();
}

// Функция для редактирования фильтра
function editFilter(index) {
    // Получаем данные фильтра
    const filter = appliedFilters[index];

    // Обновляем заголовок секции
    filterSelectionTitle.textContent = `Редактирование фильтра: ${filter.name}`;

    // Устанавливаем категорию и название фильтра в формах выбора
    filterCategory.value = filter.category;

    // Обновляем список доступных фильтров в выбранной категории
    handleCategoryChange();

    // Устанавливаем название фильтра
    filterName.value = filter.name;

    // Создаем поля параметров
    handleFilterChange();

    // Устанавливаем значения параметров
    if (filter.params) {
        filter.params.forEach(param => {
            const input = document.getElementById(`param_${param.name}`);
            if (input) {
                input.value = param.value;

                // Обновляем отображение значения для ползунков
                if (input.type === 'range') {
                    const label = document.querySelector(`label[for="param_${param.name}"] span`);
                    if (label) {
                        label.textContent = param.value;
                    }
                }
            }
        });
    }

    // Изменяем текст кнопки
    applyFilterBtn.innerHTML = '<i class="fas fa-save me-2"></i>Сохранить изменения';
    applyFilterBtn.dataset.editIndex = index;

    // Показываем кнопку отмены
    cancelEditBtn.style.display = 'block';

    // Прокручиваем страницу к форме редактирования
    filterCategory.scrollIntoView({ behavior: 'smooth' });
}

// Функция для выхода из режима редактирования
function exitEditMode() {
    // Восстанавливаем заголовок
    filterSelectionTitle.textContent = 'Выбор фильтра';

    // Восстанавливаем кнопку
    applyFilterBtn.innerHTML = '<i class="fas fa-magic me-2"></i>Применить фильтр';
    delete applyFilterBtn.dataset.editIndex;

    // Скрываем кнопку отмены
    cancelEditBtn.style.display = 'none';

    // Очищаем форму
    filterCategory.selectedIndex = 0;
    filterName.innerHTML = '<option value="">Сначала выберите категорию...</option>';
    filterName.disabled = true;
    filterParams.innerHTML = '';
    applyFilterBtn.disabled = true;
}

// Функция для отмены редактирования
function cancelEditing() {
    exitEditMode();
}

// Повторное применение всех фильтров
async function reapplyFilters() {
    // Отображение индикатора обработки
    processingContainer.style.display = 'block';
    processingText.textContent = `Обновление фильтров...`;

    await resetServerFilters();

    try {
        // Начинаем с исходного изображения
        preview.src = originalImageData;
        currentResultData = originalImageData;

        // Последовательно применяем все фильтры
        for (let i = 0; i < appliedFilters.length; i++) {
            const filter = appliedFilters[i];

            processingText.textContent = `Применение фильтра ${i+1} из ${appliedFilters.length}: ${filter.name}`;

            // Отправка запроса на применение фильтра
            const response = await fetch(`/apply_filter/${currentImageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter_name: filter.name,
                    filter_category: filter.category,
                    params: filter.params
                })
            });

            const data = await response.json();

            if (data.success) {
                // Обновление изображения
                preview.src = data.image_data;
                currentResultData = data.image_data;
                uploadedImages[currentImageIndex].resultData = currentResultData;
            } else {
                alert('Ошибка при применении фильтра: ' + data.message);
                break;
            }
        }

        // Обновляем список примененных фильтров
        updateAppliedFiltersList();
        updateThumbnailsContainer();
    } catch (error) {
        console.error('Ошибка при обновлении фильтров:', error);
        alert('Ошибка при обновлении фильтров');
    } finally {
        // Скрытие индикатора обработки
        processingContainer.style.display = 'none';
    }
}

// Обновление списка примененных фильтров
function updateAppliedFiltersList() {
    // Очистка списка
    appliedFiltersContainer.innerHTML = '';

    // Если фильтров нет, отображаем сообщение
    if (appliedFilters.length === 0) {
        const message = document.createElement('p');
        message.className = 'text-muted text-center';
        message.textContent = 'Нет примененных фильтров';
        appliedFiltersContainer.appendChild(message);
        return;
    }

    // Создаем контейнер для фильтров, если его еще нет
    let filterList = document.createElement('div');
    filterList.className = 'filter-list';
    appliedFiltersContainer.appendChild(filterList);

    // Создание списка фильтров
    appliedFilters.forEach((filter, index) => {
        const filterItem = document.createElement('div');
        filterItem.className = 'badge bg-primary p-2 me-2 mb-2 d-inline-flex align-items-center';
        filterItem.setAttribute('data-index', index);
        filterItem.style.cursor = 'grab';

        // Добавляем значок для перетаскивания
        const dragHandle = document.createElement('span');
        dragHandle.className = 'me-1';
        dragHandle.innerHTML = '<i class="fas fa-grip-lines-vertical"></i>';
        filterItem.appendChild(dragHandle);

        // Название фильтра и его редактирование
        const nameSpan = document.createElement('span');
        nameSpan.className = 'filter-name';
        nameSpan.textContent = filter.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', () => editFilter(index));
        filterItem.appendChild(nameSpan);

        // Добавление кнопки удаления
        const removeBtn = document.createElement('span');
        removeBtn.className = 'ms-2 filter-action';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Предотвращаем всплытие события
            removeFilter(index);
        });

        filterItem.appendChild(removeBtn);
        filterList.appendChild(filterItem);
    });

    // Инициализация Sortable для перетаскивания фильтров
    if (appliedFilters.length > 0) {
        if (sortableInstance) {
            sortableInstance.destroy();
        }

        sortableInstance = new Sortable(filterList, {
            animation: 150,
            ghostClass: 'bg-secondary',
            onEnd: function(evt) {
                // Получаем новый индекс после перетаскивания
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;

                // Перемещаем фильтр в массиве
                if (oldIndex !== newIndex) {
                    const filterToMove = appliedFilters.splice(oldIndex, 1)[0];
                    appliedFilters.splice(newIndex, 0, filterToMove);

                    // Обновляем фильтры в массиве uploadedImages
                    uploadedImages[currentImageIndex].appliedFilters = [...appliedFilters];

                    // Применяем фильтры заново
                    reapplyFilters();
                }
            }
        });
    }
}

// Предотвращение действий по умолчанию для событий drag-and-drop
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Подсветка области при перетаскивании
function highlight() {
    dropArea.classList.add('highlight');
}

// Снятие подсветки области
function unhighlight() {
    dropArea.classList.remove('highlight');
}

// Обработка сброса файла в область загрузки
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        handleFiles(files);
    }
}

// Обработка выбора файла через диалоговое окно
function handleFileSelect(e) {
    console.log('handleFileSelect вызван', e);
    const files = e.target.files;
    console.log('Выбрано файлов:', files?.length);

    if (files && files.length > 0) {
        handleFiles(files);
    }
}

// Обработка загрузки файла
async function handleFiles(files) {
    console.log('handleFiles вызван с', files.length, 'файлами');

    uploadProgress.style.display = 'block';
    if (uploadStatus) uploadStatus.style.display = 'block';
    progressBar.style.width = '0%';

    if (uploadedCountEl && totalCountEl) {
        uploadedCountEl.textContent = '0';
        totalCountEl.textContent = files.length;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.match('image.*')) {
            console.warn(`Файл ${file.name} пропущен`);
            continue;
        }

        try {
            const percentComplete = ((i + 1) / files.length) * 100;
            progressBar.style.width = percentComplete + '%';
            if (uploadedCountEl) uploadedCountEl.textContent = i + 1;

            const reader = new FileReader();
            const uploadResult = await new Promise((resolve, reject) => {
                reader.onload = async (e) => {
                    try {
                        const formData = new FormData();
                        formData.append('file', file);

                        const response = await fetch('/upload', {
                            method: 'POST',
                            body: formData
                        });
                        resolve(await response.json());
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.readAsArrayBuffer(file);
            });

            if (uploadResult.success) {
                uploadedImages.push({
                    id: uploadResult.image_id,
                    originalData: uploadResult.image_data,
                    resultData: uploadResult.image_data,
                    fileName: file.name,
                    width: uploadResult.width,
                    height: uploadResult.height,
                    appliedFilters: []
                });
            }
        } catch (error) {
            console.error(`Ошибка загрузки ${file.name}:`, error);
        }
    }

    if (thumbnailsContainer) {
        // Показываем/скрываем контейнер миниатюр в зависимости от количества загруженных изображений
        thumbnailsContainer.style.display = uploadedImages.length >= 2 ? 'block' : 'none';
    }

    if (uploadedImages.length > 0) {
        currentImageIndex = 0;
        currentImageId = uploadedImages[0].id;
        originalImageData = uploadedImages[0].originalData;
        currentResultData = uploadedImages[0].resultData;
        appliedFilters = uploadedImages[0].appliedFilters || [];

        preview.src = currentResultData;
        imageInfo.textContent = `Размер: ${uploadedImages[0].width}x${uploadedImages[0].height} | Файл: ${uploadedImages[0].fileName}`;
        imageInfo.style.display = 'block';

        updateThumbnailsContainer();
        updateAppliedFiltersList();

        filterCategory.disabled = false;
        resetBtn.disabled = false;

        // Активируем кнопки управления, если есть примененные фильтры
        downloadBtn.disabled = appliedFilters.length === 0;
        compareBtn.disabled = appliedFilters.length === 0;
        clearFiltersBtn.disabled = appliedFilters.length === 0;
    }

    setTimeout(() => {
        uploadProgress.style.display = 'none';
        if (uploadStatus) uploadStatus.style.display = 'none';
    }, 1000);

    updateArchiveButton();
}

// Обработка изменения категории фильтра
function handleCategoryChange() {
    const category = filterCategory.value;

    // Очистка списка фильтров
    filterName.innerHTML = '<option value="">Выберите фильтр...</option>';

    if (category) {
        // Заполнение списка фильтров выбранной категории
        const filters = allFilters[category] || [];
        filters.forEach(filter => {
            const option = document.createElement('option');
            option.value = filter;
            option.textContent = filter;
            filterName.appendChild(option);
        });

        // Включение списка фильтров
        filterName.disabled = false;
    } else {
        // Отключение списка фильтров
        filterName.disabled = true;

        // Очистка параметров
        filterParams.innerHTML = '';

        // Отключение кнопки применения
        applyFilterBtn.disabled = true;
    }

    // Очистка параметров
    filterParams.innerHTML = '';
}

// Обработка изменения фильтра
function handleFilterChange() {
    const filter = filterName.value;
    const category = filterCategory.value;

    // Очистка параметров
    filterParams.innerHTML = '';

    if (filter && category) {
        // Создание полей для параметров в зависимости от выбранного фильтра
        createFilterParamsFields(category, filter);

        // Включение кнопки применения
        applyFilterBtn.disabled = false;
    } else {
        // Отключение кнопки применения
        applyFilterBtn.disabled = true;
    }
}

// Создание полей для параметров фильтра
function createFilterParamsFields(category, filter) {
    // Набор параметров зависит от выбранного фильтра и категории
    let params = [];

    // Размытие и сглаживание
    if (category === "Размытие и сглаживание") {
        if (filter === "Размытие по Гауссу") {
            params = [
                { name: "ksize_x", label: "Размер ядра X", type: "range", min: 1, max: 99, step: 2, value: 5 },
                { name: "ksize_y", label: "Размер ядра Y", type: "range", min: 1, max: 99, step: 2, value: 5 },
                { name: "sigma", label: "Сигма", type: "range", min: 0, max: 20, step: 0.1, value: 0 }
            ];
        } else if (filter === "Медианный фильтр") {
            params = [
                { name: "ksize", label: "Размер ядра", type: "range", min: 1, max: 99, step: 2, value: 5 }
            ];
        } else if (filter === "Двустороннее размытие") {
            params = [
                { name: "d", label: "Диаметр", type: "range", min: 5, max: 50, step: 2, value: 9 },
                { name: "sigma_color", label: "Сигма цвет", type: "range", min: 10, max: 200, step: 5, value: 75 },
                { name: "sigma_space", label: "Сигма пространство", type: "range", min: 10, max: 200, step: 5, value: 75 }
            ];
        } else if (filter === "Размытие среднего" || filter === "Размытие по Блоку" || filter === "Размытие по Стэку") {
            params = [
                { name: "ksize_x", label: "Размер ядра X", type: "range", min: 1, max: 99, step: 2, value: 5 },
                { name: "ksize_y", label: "Размер ядра Y", type: "range", min: 1, max: 99, step: 2, value: 5 }
            ];
        } else if (filter === "Фильтр Собеля") {
            params = [
                { name: "dx", label: "Порядок производной X", type: "range", min: 0, max: 3, step: 1, value: 1 },
                { name: "dy", label: "Порядок производной Y", type: "range", min: 0, max: 3, step: 1, value: 1 },
                { name: "ksize", label: "Размер ядра", type: "select", options: [1, 3, 5, 7], value: 3 }
            ];
        } else if (filter === "Фильтр Лапласа") {
            params = [
                { name: "ksize", label: "Размер ядра", type: "select", options: [1, 3, 5, 7], value: 3 }
            ];
        } else if (filter === "Фильтр НЧМ (Нижних частот)") {
            params = [
                { name: "cutoff", label: "Частота среза", type: "range", min: 5, max: 200, step: 1, value: 30 }
            ];
        }
    }

    // Обнаружение краев и контуров
    else if (category === "Обнаружение краев и контуров") {
        if (filter === "Canny") {
            params = [
                { name: "threshold1", label: "Порог 1", type: "range", min: 0, max: 500, step: 1, value: 100 },
                { name: "threshold2", label: "Порог 2", type: "range", min: 0, max: 500, step: 1, value: 200 }
            ];
        } else if (filter === "Собель X" || filter === "Собель Y" || filter === "Собель XY" || filter === "Лаплас") {
            params = [
                { name: "ksize", label: "Размер ядра", type: "select", options: [1, 3, 5, 7], value: 3 }
            ];
        } else if (filter === "Детектор углов Харриса") {
            params = [
                { name: "block_size", label: "Размер блока", type: "range", min: 2, max: 10, step: 1, value: 2 },
                { name: "ksize", label: "Размер ядра", type: "select", options: [1, 3, 5, 7], value: 3 },
                { name: "k", label: "Параметр k", type: "range", min: 0.01, max: 0.1, step: 0.01, value: 0.04 }
            ];
        } else if (filter === "Детектор углов Ши-Томаси") {
            params = [
                { name: "max_corners", label: "Макс. углов", type: "range", min: 10, max: 500, step: 10, value: 100 },
                { name: "quality_level", label: "Качество", type: "range", min: 0.001, max: 0.1, step: 0.001, value: 0.01 },
                { name: "min_distance", label: "Мин. расстояние", type: "range", min: 1, max: 100, step: 1, value: 10 }
            ];
        } else if (filter === "Выделение контуров") {
            params = [
                { name: "threshold1", label: "Порог 1", type: "range", min: 0, max: 500, step: 1, value: 100 },
                { name: "threshold2", label: "Порог 2", type: "range", min: 0, max: 500, step: 1, value: 200 }
            ];
        }
    }

    // Цветовые преобразования
    else if (category === "Цветовые преобразования") {
        if (filter === "Сепия") {
            params = [
                { name: "intensity", label: "Интенсивность", type: "range", min: 0, max: 1, step: 0.05, value: 1 }
            ];
        } else if (filter === "Изменение насыщенности") {
            params = [
                { name: "scale", label: "Масштаб", type: "range", min: 0, max: 3, step: 0.05, value: 1.5 }
            ];
        } else if (filter === "Изменение оттенка") {
            params = [
                { name: "shift", label: "Сдвиг", type: "range", min: 0, max: 180, step: 1, value: 10 }
            ];
        } else if (filter === "Повышение контраста CLAHE") {
            params = [
                { name: "clip_limit", label: "Предел отсечения", type: "range", min: 0.5, max: 10, step: 0.5, value: 2 },
                { name: "tile_grid_size", label: "Размер сетки", type: "range", min: 2, max: 16, step: 2, value: 8 }
            ];
        } else if (filter === "Изменение баланса RGB") {
            params = [
                { name: "r_scale", label: "Красный", type: "range", min: 0, max: 2, step: 0.05, value: 1 },
                { name: "g_scale", label: "Зеленый", type: "range", min: 0, max: 2, step: 0.05, value: 1 },
                { name: "b_scale", label: "Синий", type: "range", min: 0, max: 2, step: 0.05, value: 1 }
            ];
        }
    }

    // Морфологические операции
    else if (category === "Морфологические операции") {
        if (filter === "Эрозия" || filter === "Дилатация" || filter === "Открытие" || filter === "Закрытие") {
            params = [
                { name: "ksize", label: "Размер ядра", type: "range", min: 1, max: 21, step: 2, value: 5 },
                { name: "iterations", label: "Итерации", type: "range", min: 1, max: 10, step: 1, value: 1 }
            ];
        } else if (filter === "Градиент" || filter === "Верхняя шляпа" || filter === "Черная шляпа") {
            params = [
                { name: "ksize", label: "Размер ядра", type: "range", min: 1, max: 21, step: 2, value: 5 }
            ];
        } else if (filter === "Скелетизация" || filter === "Утончение") {
            params = [
                { name: "iterations", label: "Итерации", type: "range", min: 1, max: 30, step: 1, value: 10 }
            ];
        }
    }

    // Геометрические преобразования
    else if (category === "Геометрические преобразования") {
        if (filter === "Масштабирование") {
            params = [
                { name: "scale", label: "Масштаб", type: "range", min: 0.1, max: 3, step: 0.1, value: 1 }
            ];
        } else if (filter === "Поворот") {
            params = [
                { name: "angle", label: "Угол", type: "range", min: -180, max: 180, step: 1, value: 0 }
            ];
        } else if (filter === "Отражение") {
            params = [
                { name: "mode", label: "Режим", type: "select", options: ["Вертикально", "Горизонтально", "Оба"], value: "Горизонтально" }
            ];
        } else if (filter === "Сдвиг") {
            params = [
                { name: "x_shift", label: "Сдвиг X", type: "range", min: -100, max: 100, step: 1, value: 0 },
                { name: "y_shift", label: "Сдвиг Y", type: "range", min: -100, max: 100, step: 1, value: 0 }
            ];
        }
    }

    // Улучшение изображения
    else if (category === "Улучшение изображения") {
        if (filter === "Гамма-коррекция") {
            params = [
                { name: "gamma", label: "Гамма", type: "range", min: 0.1, max: 5, step: 0.1, value: 1 }
            ];
        } else if (filter === "Яркость/Контраст") {
            params = [
                { name: "brightness", label: "Яркость", type: "range", min: -100, max: 100, step: 1, value: 0 },
                { name: "contrast", label: "Контраст", type: "range", min: -100, max: 100, step: 1, value: 0 }
            ];
        }
    }

    // Сегментация и пороги
    else if (category === "Сегментация и пороги") {
        if (filter === "Бинаризация (пороговая)") {
            params = [
                { name: "thresh", label: "Порог", type: "range", min: 0, max: 255, step: 1, value: 127 }
            ];
        } else if (filter === "Адаптивный порог") {
            params = [
                { name: "block_size", label: "Размер блока", type: "range", min: 3, max: 31, step: 2, value: 11 },
                { name: "C", label: "Константа C", type: "range", min: -10, max: 10, step: 1, value: 2 }
            ];
        } else if (filter === "K-Means") {
            params = [
                { name: "K", label: "Число кластеров", type: "range", min: 2, max: 10, step: 1, value: 4 }
            ];
        }
    }

    // Пользовательские фильтры
    else if (category === "Пользовательские фильтры") {
        if (filter === "Пикселизация") {
            params = [
                { name: "block_size", label: "Размер блока", type: "range", min: 2, max: 50, step: 1, value: 10 }
            ];
        } else if (filter === "Размытие в движении") {
            params = [
                { name: "kernel_size", label: "Размер ядра", type: "range", min: 3, max: 50, step: 2, value: 15 }
            ];
        }
    }

    // Создание полей для параметров
    params.forEach(param => {
        const container = document.createElement('div');
        container.className = 'mb-3';

        const label = document.createElement('label');
        label.htmlFor = `param_${param.name}`;
        label.className = 'form-label';
        label.textContent = param.label;

        let input;

        if (param.type === 'select') {
            input = document.createElement('select');
            input.className = 'form-select';

            param.options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option;
                optionEl.textContent = option;

                if (option === param.value) {
                    optionEl.selected = true;
                }

                input.appendChild(optionEl);
            });
        } else {
            input = document.createElement('input');
            input.type = param.type;
            input.className = 'form-control';
            input.min = param.min;
            input.max = param.max;
            input.step = param.step;
            input.value = param.value;

            if (param.type === 'range') {
                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'ms-2';
                valueDisplay.textContent = param.value;

                input.addEventListener('input', () => {
                    valueDisplay.textContent = input.value;
                });

                label.appendChild(valueDisplay);
            }
        }

        input.id = `param_${param.name}`;
        input.name = param.name;

        container.appendChild(label);
        container.appendChild(input);

        filterParams.appendChild(container);
    });

    // Если параметров нет, сообщаем об этом
    if (params.length === 0) {
        const message = document.createElement('p');
        message.className = 'text-muted';
        message.textContent = 'Этот фильтр не имеет настраиваемых параметров';
        filterParams.appendChild(message);
    }
}

// Применение фильтра
async function applyFilter() {
    // Проверка наличия изображения
    if (!currentImageId) {
        alert('Сначала загрузите изображение');
        return;
    }

    // Получение выбранных значений
    const category = filterCategory.value;
    const filterSelected = filterName.value;

    if (!category || !filterSelected) {
        alert('Выберите категорию и фильтр');
        return;
    }

    // Сбор параметров фильтра
    const params = [];
    const paramElements = filterParams.querySelectorAll('input, select');

    paramElements.forEach(element => {
        let value = element.value;

        // Преобразование значения в зависимости от типа
        if (element.type === 'number' || element.type === 'range') {
            value = parseFloat(value);
        }

        params.push({
            name: element.name,
            value: value
        });
    });

    // Проверяем, редактируется ли существующий фильтр
    const editIndex = applyFilterBtn.dataset.editIndex;
    const isEditing = editIndex !== undefined;

    // Отображение индикатора обработки
    processingContainer.style.display = 'block';
    processingText.textContent = isEditing ?
        `Обновление фильтра: ${filterSelected}` :
        `Применение фильтра: ${filterSelected}`;

    // Отключение кнопок на время обработки
    applyFilterBtn.disabled = true;

    try {
        // Если редактируем фильтр, обновляем его в массиве
        if (isEditing) {
            appliedFilters[editIndex] = {
                category: category,
                name: filterSelected,
                params: params
            };

            // Обновляем фильтры в массиве uploadedImages
            uploadedImages[currentImageIndex].appliedFilters = [...appliedFilters];

            // После обновления применяем все фильтры заново в правильном порядке
            await reapplyFilters();

            // Сбрасываем режим редактирования
            exitEditMode();

            console.log('Фильтр успешно обновлен:', filterSelected);
        } else {
            // Добавление нового фильтра
            // Отправка запроса на применение фильтра
            const response = await fetch(`/apply_filter/${currentImageId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter_name: filterSelected,
                    filter_category: category,
                    params: params
                })
            });

            const data = await response.json();

            if (data.success) {
                // Обновление изображения
                preview.src = data.image_data;
                preview.classList.add('fade-in');

                // Сохранение результата
                currentResultData = data.image_data;

                // Добавление фильтра в список примененных
                appliedFilters.push({
                    category: category,
                    name: filterSelected,
                    params: params
                });

                // Сохраняем измененные фильтры в массиве uploadedImages
                uploadedImages[currentImageIndex].appliedFilters = [...appliedFilters];
                uploadedImages[currentImageIndex].resultData = currentResultData;

                // Обновление списка примененных фильтров
                updateAppliedFiltersList();
                updateThumbnailsContainer();

                // Включение кнопок
                downloadBtn.disabled = false;
                compareBtn.disabled = false;
                clearFiltersBtn.disabled = false;

                console.log('Фильтр успешно применен:', filterSelected);
                updateArchiveButton();
            } else {
                alert('Ошибка при применении фильтра: ' + data.message);
            }
        }

        // Сбрасываем форму после добавления фильтра
        if (!isEditing) {
            filterParams.innerHTML = '';
            filterName.selectedIndex = 0;
        }
    } catch (error) {
        console.error('Ошибка при применении фильтра:', error);
        alert('Ошибка при применении фильтра');
    } finally {
        // Скрытие индикатора обработки
        processingContainer.style.display = 'none';

        // Включение кнопки применения
        applyFilterBtn.disabled = false;
    }
}

function updateArchiveButton() {
    const hasMultipleImages = uploadedImages.length > 1;

    // Проверяем, есть ли хотя бы одно изображение с примененными фильтрами
    const hasProcessedImages = uploadedImages.some(img =>
        img.appliedFilters && img.appliedFilters.length > 0
    );

    // Показываем кнопку если есть несколько изображений
    // Наличие фильтров больше не обязательно, так как мы можем архивировать и необработанные изображения
    const shouldShow = hasMultipleImages;

    // Обновление стиля
    archiveBtn.style.display = shouldShow ? "block" : "none";

    // Обновление текста с информацией об обработанных изображениях
    if (shouldShow) {
        if (hasProcessedImages) {
            archiveBtn.innerHTML = `<i class="fas fa-file-archive me-2"></i>Скачать архив (${uploadedImages.length} файлов, есть обработанные)`;
        } else {
            archiveBtn.innerHTML = `<i class="fas fa-file-archive me-2"></i>Скачать архив (${uploadedImages.length} файлов)`;
        }
    }
}

function switchToImage(index) {
    if (index < 0 || index >= uploadedImages.length) {
        return;
    }

    // Если текущее изображение, нет необходимости переключаться
    if (currentImageIndex === index) return;

    // Сохраняем текущий индекс
    currentImageIndex = index;
    const selectedImage = uploadedImages[index];

    // Обновляем глобальные переменные
    currentImageId = selectedImage.id;
    originalImageData = selectedImage.originalData;
    currentResultData = selectedImage.resultData || selectedImage.originalData;

    // Обновляем список примененных фильтров для нового изображения
    appliedFilters = selectedImage.appliedFilters || [];

    // Обновляем большое изображение
    preview.src = currentResultData;

    // Обновляем информацию об изображении
    imageInfo.textContent = `Размер: ${selectedImage.width}x${selectedImage.height} | Файл: ${selectedImage.fileName}`;
    imageInfo.style.display = 'block';

    // Обновляем выделение миниатюры
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, idx) => {
        if (idx === index) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });

    // Обновляем список примененных фильтров в UI
    updateAppliedFiltersList();

    // Активируем/деактивируем кнопки в зависимости от наличия фильтров
    downloadBtn.disabled = appliedFilters.length === 0;
    compareBtn.disabled = appliedFilters.length === 0;
    clearFiltersBtn.disabled = appliedFilters.length === 0;
}

function updateThumbnailsContainer() {
    if (!thumbnailsContainer) return;

    // Получаем контейнер с основным изображением
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const previewParent = imagePreviewContainer ? imagePreviewContainer.parentElement : null;

    // Управляем видимостью контейнера миниатюр
    if (uploadedImages.length < 2) {
        // Скрываем миниатюры когда меньше 2-х изображений
        thumbnailsContainer.style.display = 'none';

        // Расширяем контейнер основного изображения на всю ширину
        if (previewParent) {
            previewParent.classList.remove('col-md-9');
            previewParent.classList.add('col-12');
        }
    } else {
        // Показываем миниатюры
        thumbnailsContainer.style.display = 'block';

        // Возвращаем стандартную ширину
        if (previewParent) {
            previewParent.classList.remove('col-12');
            previewParent.classList.add('col-md-9');
        }

        // Очищаем и заполняем контейнер миниатюр
        thumbnailsContainer.innerHTML = '';

        // Добавляем миниатюры для каждого изображения
        uploadedImages.forEach((image, index) => {
            const thumbnailDiv = document.createElement('div');
            thumbnailDiv.className = `thumbnail ${index === currentImageIndex ? 'active' : ''}`;
            thumbnailDiv.style.position = 'relative';

            // Используем оригинальные или обработанные данные для миниатюры
            const thumbnailSrc = image.resultData || image.originalData;

            thumbnailDiv.innerHTML = `
                <img src="${thumbnailSrc}"
                     alt="${image.fileName}"
                     class="thumbnail-image">
                <button class="btn btn-danger btn-sm delete-btn"
                        data-index="${index}"
                        title="Удалить изображение">
                    <i class="fas fa-times"></i>
                </button>
            `;

            // Обработчики событий
            thumbnailDiv.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteImage(index);
            });

            thumbnailDiv.addEventListener('click', () => switchToImage(index));

            thumbnailsContainer.appendChild(thumbnailDiv);
        });
    }
}

async function deleteImage(index) {
    if (!confirm('Удалить это изображение?')) return;

    const imageId = uploadedImages[index].id;

    try {
        // Удаление на сервере
        await fetch(`/images/${imageId}`, { method: 'DELETE' });

        // Удаление из локального массива
        uploadedImages.splice(index, 1);

        // Обновление текущего индекса если нужно
        if (uploadedImages.length > 0) {
            if (currentImageIndex >= uploadedImages.length) {
                currentImageIndex = uploadedImages.length - 1;
            }

            // Обновляем текущее изображение
            switchToImage(currentImageIndex);
        } else {
            // Если не осталось изображений, сбрасываем состояние UI
            resetUIState();
        }

        // Обновление интерфейса миниатюр
        updateThumbnailsContainer();

        // Обновление видимости кнопки архива
        updateArchiveButton();

    } catch (error) {
        console.error('Ошибка удаления:', error);
    }
}

function resetUIState() {
    currentImageId = null;
    originalImageData = null;
    currentResultData = null;
    appliedFilters = [];

    preview.src = '/static/placeholder.jpg';
    imageInfo.style.display = 'none';

    filterCategory.selectedIndex = 0;
    filterName.innerHTML = '<option value="">Сначала выберите категорию...</option>';
    filterParams.innerHTML = '';
    filterCategory.disabled = true;

    downloadBtn.disabled = true;
    compareBtn.disabled = true;
    clearFiltersBtn.disabled = true;
    resetBtn.disabled = true;

    updateAppliedFiltersList();
}

async function handleArchiveDownload() {
    try {
        processingContainer.style.display = 'block';
        processingText.textContent = 'Подготовка архива...';

        // Получаем только ID всех загруженных изображений
        // Нам больше не нужно передавать фильтры, так как будут использоваться
        // уже обработанные изображения с сервера
        const imageIds = uploadedImages.map(img => img.id);

        const response = await fetch('/create_archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_ids: imageIds,
                filters: [] // Пустой массив, т.к. фильтры нам уже не нужны
            })
        });

        const data = await response.json();

        if (data.success) {
            // Скачивание архива
            window.location.href = data.download_url;
        } else {
            alert('Ошибка: ' + (data.detail || 'Не удалось создать архив'));
        }
    } catch (error) {
        console.error('Ошибка архивации:', error);
        alert('Ошибка при создании архива');
    } finally {
        processingContainer.style.display = 'none';
    }
}