/**
 * Editor Module - Integración del editor con el mapa
 */

import { initEventForm } from './forms.js';
import { canEdit } from './auth.js';

let editorMode = 'create'; // 'create' o 'edit'
let selectedEvent = null;

/**
 * ====================================
 * INICIALIZACIÓN DEL EDITOR
 * ====================================
 */

export function initEditor() {
    const editorPanel = document.getElementById('editor-panel');
    const editorContent = document.getElementById('editor-content');
    const toggleBtn = document.getElementById('toggle-editor');

    if (!editorPanel || !canEdit()) {
        return;
    }

    // Toggle minimizar/maximizar
    toggleBtn.addEventListener('click', toggleEditorPanel);

    // Inicializar con formulario de creación
    initEventForm(editorContent);

    // Habilitar selección desde mapa
    enableMapSelection();
}

/**
 * Toggle del panel
 */
function toggleEditorPanel() {
    const editorPanel = document.getElementById('editor-panel');
    const toggleBtn = document.getElementById('toggle-editor');

    editorPanel.classList.toggle('minimized');

    if (editorPanel.classList.contains('minimized')) {
        toggleBtn.textContent = '▲ Maximizar';
    } else {
        toggleBtn.textContent = '▼ Minimizar';
    }
}

/**
 * ====================================
 * SELECCIÓN DESDE MAPA
 * ====================================
 */

/**
 * Habilitar selección de eventos desde el mapa
 */
function enableMapSelection() {
    // Esta función se integra con app.js
    // Necesitamos acceder al mapa global y sus marcadores

    // Esperamos a que el mapa esté cargado
    const checkMapInterval = setInterval(() => {
        if (window.map && window.eventsLayer) {
            clearInterval(checkMapInterval);
            attachMapClickHandlers();
        }
    }, 500);
}

/**
 * Adjuntar handlers de clic a los marcadores del mapa
 */
function attachMapClickHandlers() {
    // Agregar mensaje informativo al mapa
    addMapInstructions();

    // Los marcadores ya existen en app.js
    // Necesitamos interceptar los clics cuando el usuario está autenticado
    
    // Obtener todos los marcadores del layer
    if (window.eventsLayer) {
        window.eventsLayer.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                // Agregar botón de edición al popup
                layer.on('popupopen', (e) => {
                    addEditButtonToPopup(e.popup, layer);
                });
            }
        });
    }
}

/**
 * Agregar instrucciones al mapa
 */
function addMapInstructions() {
    const mapContainer = document.getElementById('map');
    
    // Verificar si ya existe
    if (document.getElementById('map-edit-instructions')) {
        return;
    }

    const instructions = document.createElement('div');
    instructions.id = 'map-edit-instructions';
    instructions.className = 'alert-inline info';
    instructions.style.cssText = `
        position: absolute;
        top: 70px;
        left: 10px;
        z-index: 1000;
        max-width: 300px;
        font-size: 0.85rem;
    `;
    instructions.innerHTML = `
        <strong>💡 Modo Edición:</strong><br>
        Haz clic en un marcador y luego en "✏️ Editar" para modificar el evento.
    `;

    mapContainer.appendChild(instructions);

    // Auto-ocultar después de 10 segundos
    setTimeout(() => {
        instructions.style.transition = 'opacity 0.5s';
        instructions.style.opacity = '0';
        setTimeout(() => instructions.remove(), 500);
    }, 10000);
}

/**
 * Agregar botón de edición al popup
 */
function addEditButtonToPopup(popup, marker) {
    if (!canEdit()) return;

    const content = popup.getContent();
    
    // Verificar si ya tiene botón de edición
    if (typeof content === 'string' && content.includes('edit-event-btn')) {
        return;
    }

    // Crear contenedor temporal para manipular el HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    // Agregar botón al final
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-primary btn-block';
    editBtn.style.cssText = 'margin-top: 15px;';
    editBtn.innerHTML = '✏️ Editar este evento';
    editBtn.onclick = () => {
        handleEditEvent(marker);
    };

    tempDiv.appendChild(editBtn);
    popup.setContent(tempDiv);
}

/**
 * Manejar edición de evento
 */
async function handleEditEvent(marker) {
    // Cerrar popup
    marker.closePopup();

    // Obtener datos del evento desde el marcador
    // (asumimos que marker tiene una propiedad customData o similar)
    const eventData = marker.options.eventData;

    if (!eventData) {
        alert('No se pudo obtener la información del evento');
        return;
    }

    // Cambiar a modo edición
    editorMode = 'edit';
    selectedEvent = eventData;

    // Cargar formulario de edición
    loadEditForm(eventData);

    // Scroll al editor
    scrollToEditor();
}

/**
 * ====================================
 * FORMULARIO DE EDICIÓN
 * ====================================
 */

/**
 * Cargar formulario de edición con datos existentes
 */
function loadEditForm(eventData) {
    const editorContent = document.getElementById('editor-content');

    // Mostrar mensaje de carga
    editorContent.innerHTML = `
        <div class="alert-inline info">
            <p>📥 Cargando datos del evento...</p>
        </div>
    `;

    // Obtener datos completos del evento desde la API
    import('./api.js').then(({ EventsAPI }) => {
        EventsAPI.get(eventData.id).then(result => {
            if (result.success) {
                renderEditForm(result.data);
            } else {
                editorContent.innerHTML = `
                    <div class="alert-inline error">
                        <p>❌ Error al cargar evento: ${result.error}</p>
                        <button onclick="location.reload()" class="btn btn-outline-secondary">
                            🔄 Reintentar
                        </button>
                    </div>
                `;
            }
        });
    });
}

/**
 * Renderizar formulario de edición
 */
function renderEditForm(eventData) {
    const editorContent = document.getElementById('editor-content');

    // Generar formulario similar al de creación pero con datos prellenados
    editorContent.innerHTML = `
        <div class="alert-inline warning" style="margin-bottom: 20px;">
            <p>⚠️ <strong>Modo Edición:</strong> Editando evento "${eventData.event_title}"</p>
            <button id="cancel-edit-btn" class="btn btn-outline-secondary btn-sm">
                ❌ Cancelar edición
            </button>
        </div>
    `;

    // Por ahora, mostrar mensaje de "próximamente"
    // La implementación completa requeriría replicar el formulario de creación
    // con los datos prellenados
    editorContent.innerHTML += `
        <div class="alert-inline info">
            <h4>🚧 Funcionalidad de edición en desarrollo</h4>
            <p>Por ahora, puedes:</p>
            <ul>
                <li>Ver los datos del evento aquí</li>
                <li>Crear nuevos eventos con el formulario de creación</li>
            </ul>
            <details>
                <summary>Datos del evento (JSON)</summary>
                <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(eventData, null, 2)}
                </pre>
            </details>
            <button id="back-to-create-btn" class="btn btn-primary" style="margin-top: 15px;">
                ➕ Crear nuevo evento
            </button>
        </div>
    `;

    // Event listeners
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            editorMode = 'create';
            selectedEvent = null;
            initEventForm(editorContent);
        });
    }

    const backBtn = document.getElementById('back-to-create-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            editorMode = 'create';
            selectedEvent = null;
            initEventForm(editorContent);
        });
    }
}

/**
 * ====================================
 * UTILIDADES
 * ====================================
 */

/**
 * Scroll suave al editor
 */
function scrollToEditor() {
    const editorPanel = document.getElementById('editor-panel');
    
    if (editorPanel) {
        // Asegurarse de que esté maximizado
        if (editorPanel.classList.contains('minimized')) {
            document.getElementById('toggle-editor').click();
        }

        // Scroll suave
        editorPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Obtener modo actual
 */
export function getEditorMode() {
    return editorMode;
}

/**
 * Obtener evento seleccionado
 */
export function getSelectedEvent() {
    return selectedEvent;
}