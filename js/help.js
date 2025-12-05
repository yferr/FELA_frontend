/**
 * Help Module - Sistema de ayuda interactivo para usuarios
 */

import { getCurrentUser } from './auth.js';

/**
 * Inicializar el sistema de ayuda
 */
export function initHelp() {
    const helpButton = document.getElementById('help-button');
    const helpModal = document.getElementById('help-modal');
    const closeModalBtn = document.getElementById('close-help-modal');
    const helpOverlay = document.getElementById('help-overlay');

    if (!helpButton || !helpModal) {
        console.warn('Elementos de ayuda no encontrados');
        return;
    }

    // Mostrar/ocultar botón según autenticación
    updateHelpButtonVisibility();

    // Abrir modal
    helpButton.addEventListener('click', openHelpModal);

    // Cerrar modal - botón X
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeHelpModal);
    }

    // Cerrar modal - clic en overlay
    if (helpOverlay) {
        helpOverlay.addEventListener('click', closeHelpModal);
    }

    // Cerrar modal - tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpModal.classList.contains('visible')) {
            closeHelpModal();
        }
    });

    // Inicializar acordeón
    initAccordion();
}

/**
 * Mostrar/ocultar botón de ayuda según autenticación
 */
export function updateHelpButtonVisibility() {
    const helpButton = document.getElementById('help-button');
    if (!helpButton) return;

    const currentUser = getCurrentUser();
    
    if (currentUser && currentUser.is_approved) {
        helpButton.style.display = 'flex';
    } else {
        helpButton.style.display = 'none';
    }
}

/**
 * Abrir modal de ayuda
 */
function openHelpModal() {
    const helpModal = document.getElementById('help-modal');
    const helpOverlay = document.getElementById('help-overlay');
    
    if (helpModal) {
        helpModal.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body
    }
    
    if (helpOverlay) {
        helpOverlay.classList.add('visible');
    }
}

/**
 * Cerrar modal de ayuda
 */
function closeHelpModal() {
    const helpModal = document.getElementById('help-modal');
    const helpOverlay = document.getElementById('help-overlay');
    
    if (helpModal) {
        helpModal.classList.remove('visible');
        document.body.style.overflow = ''; // Restaurar scroll
    }
    
    if (helpOverlay) {
        helpOverlay.classList.remove('visible');
    }
}

/**
 * Inicializar funcionalidad de acordeón
 */
function initAccordion() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const accordionItem = header.parentElement;
            const isActive = accordionItem.classList.contains('active');
            
            // Cerrar todos los demás items
            document.querySelectorAll('.accordion-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Toggle el item clickeado
            if (!isActive) {
                accordionItem.classList.add('active');
            }
        });
    });
    
    // Abrir la primera sección por defecto
    const firstItem = document.querySelector('.accordion-item');
    if (firstItem) {
        firstItem.classList.add('active');
    }
}

/**
 * Función global para cerrar modal (llamada desde HTML)
 */
window.closeHelpModal = closeHelpModal;