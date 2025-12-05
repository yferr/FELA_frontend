/**
 * Editor Module - Integración del editor con el mapa
 * Actualizado con sistema de pestañas para crear/agregar/editar
 */

import { initEventForm, initAddPresentationForm, initAddSpeakerForm } from './forms.js';
import { canEdit } from './auth.js';

let editorMode = 'create'; // 'create', 'add', 'edit'
let selectedEvent = null;
let currentTab = 'create';

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

    // Crear estructura de pestañas
    renderTabsStructure(editorContent);

    // Inicializar con formulario de creación
    initEventForm(document.getElementById('create-tab'));

    // Habilitar selección desde mapa
    enableMapSelection();
}

/**
 * Renderizar estructura de pestañas
 */
function renderTabsStructure(container) {
    container.innerHTML = `
        <div class="editor-tabs">
            <button class="tab-btn active" data-tab="create">🆕 Crear Evento</button>
            <button class="tab-btn" data-tab="add">➕ Agregar Elemento</button>
            <button class="tab-btn" data-tab="edit">✏️ Editar</button>
        </div>

        <div class="tab-content">
            <!-- Pestaña Crear Evento -->
            <div class="tab-pane active" id="create-tab">
                <!-- El formulario se carga dinámicamente -->
            </div>
            
            <!-- Pestaña Agregar -->
            <div class="tab-pane" id="add-tab">
                <div class="add-options">
                    <button class="add-option-btn" data-action="add-presentation">
                        📋 Agregar Presentación a Evento Existente
                        <small style="display: block; margin-top: 8px; color: #666; font-size: 0.9rem;">
                            Añade una nueva presentación con sus ponentes a un evento ya creado
                        </small>
                    </button>
                    <button class="add-option-btn" data-action="add-speaker">
                        👤 Agregar Ponente a Presentación Existente
                        <small style="display: block; margin-top: 8px; color: #666; font-size: 0.9rem;">
                            Añade un nuevo ponente a una presentación existente
                        </small>
                    </button>
                </div>
            </div>
            
            <!-- Pestaña Editar -->
            <div class="tab-pane" id="edit-tab">
                <div class="alert-inline info">
                    <h4>🚧 Funcionalidad en desarrollo</h4>
                    <p>La edición completa de eventos estará disponible próximamente.</p>
                    <p>Por ahora puedes:</p>
                    <ul>
                        <li>Crear nuevos eventos completos (pestaña "Crear Evento")</li>
                        <li>Agregar presentaciones a eventos existentes</li>
                        <li>Agregar ponentes a presentaciones existentes</li>
                    </ul>
                </div>
            </div>
        </div>
    `;

    // Event listeners para pestañas
    attachTabListeners();
}

/**
 * Event listeners para cambio de pestañas
 */
function attachTabListeners() {
    // Botones de pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Botones de agregar opciones
    document.querySelectorAll('.add-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            handleAddAction(action);
        });
    });
}

/**
 * Cambiar de pestaña
 */
function switchTab(tabName) {
    // Actualizar botones
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Actualizar contenido
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    currentTab = tabName;
}

/**
 * Manejar acciones de agregar
 */
function handleAddAction(action) {
    const addTabContent = document.getElementById('add-tab');
    
    if (action === 'add-presentation') {
        // Mostrar formulario de agregar presentación
        initAddPresentationForm(addTabContent);
    } else if (action === 'add-speaker') {
        // Mostrar formulario de agregar ponente
        initAddSpeakerForm(addTabContent);
    }
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
    addMapInstructions();

    if (window.eventsLayer) {
        window.eventsLayer.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                layer.on('popupopen', (e) => {
                    addEditButtonsToPopup(e.popup, layer);
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
    
    if (document.getElementById('map-edit-instructions')) {
        return;
    }

    const instructions = document.createElement('div');
    instructions.id = 'map-edit-instructions';
    instructions.className = 'alert-inline info';
    instructions.style.cssText = `
        position: absolute;
        top: 25%;
        left:40%;
        z-index: 1000;
        max-width: 300px;
        font-size: 0.85rem;
    `;
    instructions.innerHTML = `
        <strong>💡 Modo Edición:</strong><br>
        Haz clic en un marcador para agregar presentaciones o editar el evento.
    `;

    mapContainer.appendChild(instructions);

    setTimeout(() => {
        instructions.style.transition = 'opacity 0.5s';
        instructions.style.opacity = '0';
        setTimeout(() => instructions.remove(), 500);
    }, 10000);
}

/**
 * Agregar botones de acción al popup del mapa
 */
function addEditButtonsToPopup(popup, marker) {
    if (!canEdit()) return;

    const content = popup.getContent();
    
    if (typeof content === 'string' && content.includes('action-buttons-container')) {
        return;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;

    // Obtener datos del evento del marcador
    const eventData = marker.options.eventData;
    if (!eventData) return;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'action-buttons-container';
    buttonsDiv.style.cssText = 'display: flex; gap: 10px; margin-top: 15px; padding-top: 15px; border-top: 2px solid #e0e0e0;';
    
    buttonsDiv.innerHTML = `
        <button class="btn btn-primary add-presentation-btn" style="flex: 1;">
            ➕ Nueva Presentación
        </button>
        <button class="btn btn-outline-secondary edit-event-btn" style="flex: 1;">
            ✏️ Editar Evento
        </button>
    `;

    tempDiv.appendChild(buttonsDiv);
    popup.setContent(tempDiv);

    // Event listeners después de que el popup se actualice
    setTimeout(() => {
        const addPresBtn = popup.getElement().querySelector('.add-presentation-btn');
        const editEventBtn = popup.getElement().querySelector('.edit-event-btn');

        if (addPresBtn) {
            addPresBtn.addEventListener('click', () => {
                handleAddPresentationFromMap(eventData);
            });
        }

        if (editEventBtn) {
            editEventBtn.addEventListener('click', () => {
                handleEditEventFromMap(eventData);
            });
        }
    }, 100);
}

/**
 * Manejar agregar presentación desde mapa
 */
function handleAddPresentationFromMap(eventData) {
    // Cerrar popup
    if (window.map) {
        window.map.closePopup();
    }

    // Cambiar a pestaña "add"
    switchTab('add');

    // Maximizar editor si está minimizado
    const editorPanel = document.getElementById('editor-panel');
    if (editorPanel.classList.contains('minimized')) {
        toggleEditorPanel();
    }

    // Cargar formulario con evento prellenado
    const addTabContent = document.getElementById('add-tab');
    initAddPresentationForm(addTabContent, {
        id: eventData.id || null,
        title: eventData.eventTitle || eventData.event_title
    });

    // Scroll al editor
    scrollToEditor();
}

/**
 * Manejar edición de evento desde mapa
 */
function handleEditEventFromMap(eventData) {
    if (window.map) {
        window.map.closePopup();
    }

    switchTab('edit');

    const editorPanel = document.getElementById('editor-panel');
    if (editorPanel.classList.contains('minimized')) {
        toggleEditorPanel();
    }

    const editTabContent = document.getElementById('edit-tab');
    editTabContent.innerHTML = `
        <div class="alert-inline info">
            <h4>📋 Evento Seleccionado</h4>
            <p><strong>${eventData.eventTitle || eventData.event_title}</strong></p>
            <p>La funcionalidad de edición completa estará disponible próximamente.</p>
            <button class="btn btn-primary" onclick="handleAddPresentationFromMapGlobal('${eventData.id}', '${(eventData.eventTitle || eventData.event_title).replace(/'/g, "\\'")}')">
                ➕ Agregar Presentación a este Evento
            </button>
        </div>
    `;

    scrollToEditor();
}

/**
 * ====================================
 * FUNCIONES GLOBALES
 * ====================================
 */

// Exponer función global para ser llamada desde el HTML del popup
window.handleAddPresentationFromMapGlobal = function(eventId, eventTitle) {
    handleAddPresentationFromMap({ id: eventId, eventTitle: eventTitle });
};

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
        if (editorPanel.classList.contains('minimized')) {
            document.getElementById('toggle-editor').click();
        }

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

/**
 * Cambiar a pestaña desde fuera del módulo
 */
export function switchToTab(tabName) {
    switchTab(tabName);
}