// delivery.js - для внешнего способа доставки "тест" (ID 14999345)
// Используем InSales JavaScript API v1

// Проверка, что код выполняется в браузере
if (typeof window === 'undefined' || typeof document === 'undefined') {
  console.error('❌ delivery.js должен выполняться в браузере!');
  throw new Error('This script is intended for browser environment only.');
}

// --- ВАЖНО: Функция для безопасного вызова triggerCustom ---
function safeTriggerCustom($element, type, data, options) {
  // Проверяем и определяем triggerCustom, если его нет
  if (typeof $ !== 'undefined' && typeof $.fn.triggerCustom !== 'function') {
    console.log('🔧 Определяем $.fn.triggerCustom внутри safeTriggerCustom');
    $.fn['triggerCustom'] = function(t, d, o) {
      if (o == null) o = {};
      o = $.extend({}, { bubbles: true, cancelable: true, detail: d }, { bubbles: o.bubbles, cancelable: o.cancelable });
      return this.each(function() {
        var e = new window.CustomEvent(t, o);
        return this.dispatchEvent(e);
      });
    };
  }

  // Проверяем, определена ли функция на конкретном элементе
  if (typeof $element.triggerCustom === 'function') {
    return $element.triggerCustom(type, data, options);
  } else {
    console.error(`❌ safeTriggerCustom: $.fn.triggerCustom не определен на элементе при вызове ${type}`);
    return $element; // Возвращаем элемент для цепочки (хотя вызов не удался)
  }
}

const API_BASE_URL = 'https://insales-delivery-api.netlify.app';

// --- Функции работы с вашим API (только браузерные) ---

// Получение пунктов выдачи по городу
function getPickupPoints(city) {
  console.log('🔍 Запрашиваем ПВЗ для города:', city);
  
  // Получаем текущий час клиента
  const clientHour = new Date().getHours();
  console.log('⏰ Время клиента:', clientHour + ':00');
  
  const requestBody = {
    city: city || '',
    clientHour: clientHour
  };

  return fetch(API_BASE_URL + '/api/pickup-points', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => response.json())
  .then(data => {
    console.log('✅ Получили ПВЗ:', data.pickup_points || data);
    return data.pickup_points || data;
  });
}

// Расчет стоимости доставки до выбранного ПВЗ
function calculatePickupDelivery(orderWeight, pickupPointId) {
  console.log('🔍 Рассчитываем стоимость для ПВЗ ID:', pickupPointId, 'Вес:', orderWeight);
  
  // Получаем текущий час клиента
  const clientHour = new Date().getHours();
  console.log('⏰ Время клиента:', clientHour + ':00');
  
  const requestBody = {
    order: {
      total_weight: orderWeight || 0
    },
    pickup_point_id: pickupPointId,
    clientHour: clientHour
  };

  return fetch(API_BASE_URL + '/api/pickup-point/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => response.json())
  .then(data => {
    console.log('✅ Рассчитали стоимость:', data);
    return {
      price: data.price,
      currency: data.currency,
      delivery_days: data.delivery_days,
      delivery_date: data.delivery_date,
      delivery_date_formatted: data.delivery_date_formatted,
      estimated_delivery_days: data.estimated_delivery_days,
      description: data.description
    };
  });
}

// --- Функции для отображения ПВЗ и стилей (только браузерные) ---

// Стилизация контейнера пунктов выдачи
function stylePickupContainer(container) {
  const style = document.createElement('style');
  style.textContent = `
    .pickup-point {
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      margin: 10px 0;
      cursor: pointer;
      transition: all 0.3s ease;
      background: white;
    }
    
    .pickup-point:hover {
      border-color: #007bff;
      box-shadow: 0 2px 8px rgba(0,123,255,0.15);
    }
    
    .pickup-point.selected {
      border-color: #28a745;
      background: #f8fff9;
    }
    
    .pickup-point-title {
      margin: 0 0 10px 0;
      color: #333;
      font-size: 16px;
      font-weight: bold;
    }
    
    .pickup-point-details p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
    
    .pickup-point-price {
      margin-top: 10px;
      padding: 8px;
      background: #f8f9fa;
      border-radius: 4px;
      text-align: center;
      font-weight: bold;
      color: #495057;
    }
    
    .final-price {
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%) !important;
      color: white !important;
      padding: 15px !important;
      border-radius: 6px !important;
    }
    
    .delivery-date-highlight {
      background: rgba(255, 255, 255, 0.15);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .delivery-date-highlight strong {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .delivery-date-value {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    
    .price-value-block {
      text-align: center;
      padding: 10px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      margin: 10px 0;
    }
    
    .price-loading, .pickup-loading {
      color: #007bff;
      font-style: italic;
    }
    
    .price-error, .pickup-error {
      color: #dc3545;
      background: #f8d7da;
      padding: 8px;
      border-radius: 4px;
    }
    
    .pickup-empty, .pickup-hint {
      text-align: center;
      color: #6c757d;
      padding: 20px;
      font-style: italic;
    }
    
    .delivery-info {
      background: #e7f3ff;
      border: 1px solid #b3d7ff;
      border-radius: 4px;
      padding: 15px;
      margin: 10px 0;
    }
    
    .delivery-info h4 {
      margin: 0 0 10px 0;
      color: #004085;
    }
    
    .delivery-info p {
      margin: 5px 0;
    }
  `;
  document.head.appendChild(style);
  container.classList.add('pickup-points-styled');
}

// --- Основная логика ---
$(document).ready(function() {
  console.log('🚀 delivery.js загружен для способа доставки "тест"');

  // Ждем инициализации способов доставки InSales
  $(document).on('inited:insales:checkout:deliveries', function(e) {
    console.log('✅ InSales: Способы доставки инициализированы');
    console.log('Данные:', e.originalEvent.detail);

    // Сообщаем InSales, что мы готовы
    safeTriggerCustom($(document), 'ready:insales:delivery');
    console.log('📤 InSales: Сообщили, что готовы обрабатывать события');

    // Начинаем отслеживание событий для нашего способа доставки
    const $deliveryElement = $('#order_delivery_variant_id_14999345');

    if ($deliveryElement.length) {
      console.log('🔍 Начинаем отслеживание для способа доставки ID 14999345');

      // Событие: способ доставки выбран пользователем
      $deliveryElement.on('selected:insales:checkout:delivery', function(e) {
        const orderData = e.originalEvent.detail;
        console.log('✅ InSales: Способ доставки "тест" выбран');
        console.log('Данные заказа:', orderData);

        // Показываем интерфейс выбора ПВЗ
        showPickupPointsInterface(orderData);
      });

      // Событие: способ доставки снят (выбран другой)
      $deliveryElement.on('unselected:insales:checkout:delivery', function(e) {
        const orderData = e.originalEvent.detail;
        console.log('❌ InSales: Способ доставки "тест" снят');
        // Закрываем интерфейс ПВЗ, если открыт
        hidePickupPointsInterface();
      });

    } else {
      console.warn('⚠️ Элемент способа доставки ID 14999345 не найден.');
    }
  });
});

// --- Функция для отображения интерфейса выбора ПВЗ ---
function showPickupPointsInterface(orderData) {
  console.log('🔍 showPickupPointsInterface вызвана');
  
  // Валидация входных данных
  if (!orderData || !orderData.order) {
    console.error('❌ orderData или orderData.order не определены:', orderData);
    console.log('Доступные свойства orderData:', orderData ? Object.keys(orderData) : 'undefined');
    safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'error:insales:delivery', 'Ошибка: данные заказа недоступны. Пожалуйста, заполните адрес доставки.');
    return;
  }
  
  // Получаем город из данных заказа
  const city = orderData.order.shipping_address?.full_locality_name || orderData.order.shipping_address?.city || '';
  console.log('📍 Город из данных InSales:', city);

  if (!city || city.length < 2) {
    console.warn('⚠️ Город не указан или слишком короткий.');
    // Показать сообщение пользователю
    safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'error:insales:delivery', 'Введите город для выбора пункта выдачи.');
    return;
  }

  // Показываем спиннер "расчет" для способа доставки
  safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'calculating:insales:delivery');

  // Загружаем ПВЗ
  getPickupPoints(city)
    .then(points => {
      console.log('✅ Получили ПВЗ:', points);
      if (points && points.length > 0) {
        // Открываем модальное окно
        const $modal = $('.co-modal--outlet');
        const $modalBody = $('.js-modal-body');
        if ($modal.length && $modalBody.length) {
          $modal.removeClass('co-modal--hide');
          displayPickupPointsForSelection($modalBody, points, orderData);
        } else {
          console.error('❌ Модальное окно или контейнер для ПВЗ не найден.');
          safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'error:insales:delivery', 'Ошибка: интерфейс выбора недоступен.');
        }
      } else {
        console.log('📭 ПВЗ в городе не найдены.');
        safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'error:insales:delivery', 'Пункты выдачи в данном городе не найдены.');
      }
    })
    .catch(error => {
      console.error('❌ Ошибка загрузки ПВЗ:', error);
      safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'error:insales:delivery', 'Ошибка загрузки пунктов выдачи.');
    });
}

// --- Функция для отображения ПВЗ в интерфейсе ---
function displayPickupPointsForSelection($container, points, orderData) {
  // Очищаем контейнер
  $container.empty();

  // Создаем HTML для ПВЗ
  const pointsHTML = points.map((point, index) => `
    <div class="pickup-point" data-id="${point.id}" data-index="${index}">
      <div class="pickup-point-header">
        <h4 class="pickup-point-title">${point.title}</h4>
      </div>
      <div class="pickup-point-details">
        <p class="pickup-point-address"><strong>Адрес:</strong> ${point.address}</p>
        <p class="pickup-point-hours"><strong>Режим работы:</strong> ${point.working_hours}</p>
        <p class="pickup-point-phone"><strong>Телефон:</strong> ${point.phone}</p>
      </div>
      <div class="pickup-point-price" id="price-${point.id}">
        Выберите для расчета стоимости
      </div>
    </div>
  `).join('');

  $container.html(pointsHTML);

  // Стилизуем
  if (!$container.hasClass('pickup-points-styled')) {
    stylePickupContainer($container[0]); // Передаем DOM-элемент
  }

  // Добавляем обработчики клика
  $container.find('.pickup-point').on('click', function() {
    handlePickupPointSelection($(this), orderData);
  });
}

// --- Функция для обработки выбора ПВЗ ---
function handlePickupPointSelection($selectedPoint, orderData) {
  const pointId = $selectedPoint.data('id');
  const pointTitle = $selectedPoint.find('.pickup-point-title').text();

  console.log('✅ Выбран ПВЗ ID:', pointId, 'Название:', pointTitle);

  // Получаем вес заказа из orderData
  let orderWeight = orderData?.order?.total_weight || 0;
  if (typeof orderWeight === 'string') {
      orderWeight = parseFloat(orderWeight) || 0;
  }
  console.log('📦 Вес заказа из orderData:', orderWeight);

  // Если вес не нашли в orderData, пробуем получить из order_lines
  if (orderWeight <= 0) {
    const items = orderData?.order?.order_lines || [];
    let totalWeight = items.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);
    orderWeight = totalWeight;
    console.log('📦 Вес заказа из order_lines:', totalWeight);

    if (orderWeight <= 0) {
        console.warn('⚠️ Вес заказа не найден в orderData.order.total_weight или orderData.order.order_lines, используем 1.0 для теста.');
        orderWeight = 1.0; // ЗАМЕНИТЕ ЭТО НА РЕАЛЬНОЕ ПОЛУЧЕНИЕ ВЕСА ИЗ orderData.order.order_lines или DOM
    }
  }

  if (orderWeight <= 0) {
    alert('Не удалось определить вес заказа для расчета стоимости доставки.');
    return;
  }

  // Показываем индикатор расчета на выбранном ПВЗ
  const $priceElement = $selectedPoint.find('.pickup-point-price');
  $priceElement.html('<div class="price-loading">Расчет стоимости...</div>');

  // Снимаем выделение с других ПВЗ
  $('.pickup-point').not($selectedPoint).each(function() {
    const $otherPriceEl = $(this).find('.pickup-point-price');
    if (!$otherPriceEl.hasClass('final-price')) {
      $otherPriceEl.text('Выберите для расчета стоимости');
    }
    $(this).removeClass('selected');
  });

  // Выделяем выбранный ПВЗ
  $selectedPoint.addClass('selected');

  // Рассчитываем стоимость
  calculatePickupDelivery(orderWeight, pointId)
    .then(result => {
       console.log('✅ Рассчитанная стоимость:', result);

       // Обновляем цену и дату доставки на ПВЗ
       const deliveryDateText = result.delivery_date_formatted || 'Рассчитывается';
       $priceElement.html(`
        <div class="final-price">
          <div class="delivery-date-highlight">
            <strong>📅 Предполагаемая дата доставки:</strong>
            <span class="delivery-date-value">${deliveryDateText}</span>
          </div>
          <div class="price-value-block">
            <span class="price-value">${result.price} ${result.currency}</span>
          </div>
          <div class="price-details">
            <small>${result.description}</small>
          </div>
        </div>
       `);
       $priceElement.addClass('final-price');

      // --- КЛЮЧЕВОЙ ШАГ: Обновляем способ доставки в InSales ---
      const deliveryDataForUpdate = {
        price: result.price,
        // description: result.description, // Можно добавить описание
        fields_values: [
          // Сохраняем ID и название выбранного ПВЗ как доп. поле (если нужно)
          // ЗАМЕНИТЕ 12345 И 12346 НА РЕАЛЬНЫЕ ID ДОПОЛНИТЕЛЬНЫХ ПОЛЕЙ В INSALES, если они есть
          // { field_id: 12345, value: pointId.toString() },
          // { field_id: 12346, value: pointTitle }
        ],
        is_external: true, // Указываем, что это внешний способ
        // external_ { selected_pickup_point_id: pointId } // Произвольные данные (не сохраняются в заказ)
      };

      // Вызываем update:insales:delivery
      safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'update:insales:delivery', deliveryDataForUpdate);
      console.log('🔄 InSales: Обновлена стоимость доставки до', result.price);

      // Закрываем модальное окно (опционально)
      // $('.co-modal--outlet').addClass('co-modal--hide');

    })
    .catch(error => {
      console.error('❌ Ошибка расчета стоимости:', error);
      $priceElement.html('<div class="price-error">Ошибка расчета стоимости</div>');
      // Сбрасываем спиннер, если была ошибка
      // Важно: не сбрасываем цену на 0, если она уже была установлена ранее
      // safeTriggerCustom($('#order_delivery_variant_id_14999345'), 'update:insales:delivery', { price: 0, fields_values: [] });
    });
}

// --- Функция для скрытия интерфейса ПВЗ ---
function hidePickupPointsInterface() {
  console.log('🔍 hidePickupPointsInterface вызвана');
  // Закрываем модальное окно
  $('.co-modal--outlet').addClass('co-modal--hide');
  // Очищаем контейнер
  $('.js-modal-body').empty();
  // Сбрасываем стили
  $('.js-modal-body').removeClass('pickup-points-styled');
  // Убираем обработчики клика
  $('.pickup-point').off('click');
}

// --- Отладка ---
console.log('🔧 Для отладки используйте: getPickupPoints(), calculatePickupDelivery()');
