# Map translations

Every generated map has English and Russian copy. Keep identifiers, API paths, JSON keys, enum wire values, and schema property names unchanged; translate the surrounding explanatory text.

The manifest declares `i18n.defaultLocale` and a `translations` object with matching `ru` and `en` sections:

```json
{
  "i18n": { "defaultLocale": "ru" },
  "translations": {
    "ru": {
      "page": { "title": "Архитектура Example platform" },
      "ui": {
        "sectionsLabel": "Разделы карты архитектуры",
        "switchLanguage": "Переключить язык на английский",
        "switchToLightTheme": "Переключить на светлую тему",
        "switchToDarkTheme": "Переключить на тёмную тему",
        "required": "обязательное",
        "response": "Ответ",
        "unknownResponse": "Неизвестный ответ",
        "parameters": "Параметры",
        "noParameters": "Нет параметров",
        "request": "Тело запроса",
        "noRequestBody": "Нет тела запроса",
        "responseExample": "Пример ответа",
        "responseFields": "Поля ответа"
      },
      "tabs": { "booking": { "title": "Бронирование" } },
      "diagrams": { "booking-flow": { "title": "Путь от quote к заказу" } },
      "nodes": {
        "booking-flow:quote": { "title": "Выбранный вариант", "subtitle": "search_quotes" },
        "booking-flow:api": { "title": "Создать заказ", "subtitle": "POST /api/v1/orders" }
      },
      "edges": {
        "booking-flow:quote-to-order": {
          "label": "выбор варианта",
          "tooltip": "Выбранная котировка передаётся в черновик бронирования."
        }
      },
      "endpoints": {
        "create-order": { "description": "Создаёт заказ из сохранённого черновика бронирования." }
      }
    },
    "en": {
      "page": { "title": "Example platform architecture" },
      "ui": {
        "sectionsLabel": "Architecture map sections",
        "switchLanguage": "Switch language to Russian",
        "switchToLightTheme": "Переключить на светлую тему",
        "switchToDarkTheme": "Переключить на тёмную тему",
        "required": "required",
        "response": "Response",
        "unknownResponse": "Unknown response",
        "parameters": "Parameters",
        "noParameters": "No parameters",
        "request": "Request body",
        "noRequestBody": "No request body",
        "responseExample": "Response example",
        "responseFields": "Response fields"
      },
      "tabs": { "booking": { "title": "Booking" } },
      "diagrams": { "booking-flow": { "title": "Quote to order" } },
      "nodes": {
        "booking-flow:quote": { "title": "Selected offer", "subtitle": "search_quotes" },
        "booking-flow:api": { "title": "Create order", "subtitle": "POST /api/v1/orders" }
      },
      "edges": {
        "booking-flow:quote-to-order": {
          "label": "select offer",
          "tooltip": "The selected quote is saved to a checkout draft."
        }
      },
      "endpoints": {
        "create-order": { "description": "Creates an order from a saved checkout draft." }
      }
    }
  }
}
```

Translation keys for tabs, diagrams, and endpoints use their stable manifest IDs. Node keys use `diagramId:nodeId`. Edge keys use `diagramId:edgeId`, so labels and descriptions remain unique when the same action label appears in different flows. Both locales must include the page title and every UI label, tab, diagram, node title, node subtitle (when present), edge label and tooltip, and endpoint description (when present). The generator rejects incomplete translations before writing HTML.

The language control sits left of the theme icon and stores the selected locale in local storage. The current tab remains in the URL hash when the page reloads. The map's `lang` attribute follows the selected locale. Every connector has a keyboard-focusable, transparent hit path with `cursor: help`; hover or focus immediately shows its translated process description. Keep tooltip copy concrete: state what moves, from where, to where, and why when the source confirms it.

The light/dark button embeds the reusable friendly SVGs in `assets/icons/moon.svg` and `assets/icons/sun.svg`. It shows the moon while the light theme is active and the sun while the dark theme is active. Keep the icons inline in generated HTML so the map stays a portable single file.
