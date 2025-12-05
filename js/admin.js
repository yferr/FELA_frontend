/**
 * Admin Module - Panel de administración para superusuarios
 */

import { AuthAPI } from './api.js';
import axios from 'axios';

//const API_BASE_URL = 'http://localhost:8888';
const API_BASE_URL = 'https://gisserver.car.upv.es/fela_api';

/**
 * Obtener token CSRF de las cookies
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/**
 * Configuración de axios con credenciales
 */
function getAxiosConfig() {
    const csrfToken = getCookie('csrftoken');
    return {
        withCredentials: true,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken || ''
        }
    };
}

/**
 * Cargar usuarios pendientes de aprobación
 */
export async function loadPendingUsers() {
    const container = document.getElementById('pending-users-container');
    const loadingDiv = document.getElementById('admin-loading');
    const countSpan = document.getElementById('pending-count');
    
    if (!container) return;
    
    // Mostrar loading
    if (loadingDiv) loadingDiv.style.display = 'block';
    container.innerHTML = '';
    
    try {
        const response = await axios.get(
            `${API_BASE_URL}/auth/users/pending/`,
            getAxiosConfig()
        );
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        
        const users = response.data.users || [];
        const count = response.data.count || 0;
        
        // Actualizar contador
        if (countSpan) {
            countSpan.textContent = count;
        }
        
        if (users.length === 0) {
            container.innerHTML = `
                <div class="alert-inline info">
                    <p>✅ No hay usuarios pendientes de aprobación</p>
                </div>
            `;
            return;
        }
        
        // Renderizar cada usuario
        users.forEach(user => {
            const userCard = createUserCard(user);
            container.appendChild(userCard);
        });
        
    } catch (error) {
        if (loadingDiv) loadingDiv.style.display = 'none';
        console.error('Error cargando usuarios pendientes:', error);
        container.innerHTML = `
            <div class="alert-inline error">
                <p>❌ Error al cargar usuarios: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Crear tarjeta HTML para un usuario
 */
function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.id = `user-card-${user.id}`;
    
    const createdDate = new Date(user.created_at).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    card.innerHTML = `
        <div class="user-card-header">
            <div class="user-info">
                <h4>👤 ${user.first_name} ${user.last_name}</h4>
                <p class="user-username">@${user.username}</p>
            </div>
            <div class="user-status">
                <span class="status-badge pending">⏳ Pendiente</span>
            </div>
        </div>
        
        <div class="user-card-body">
            <div class="user-detail">
                <strong>📧 Email:</strong>
                <span>${user.email}</span>
            </div>
            <div class="user-detail">
                <strong>🏛️ Organismo:</strong>
                <span>${user.organismo || 'No especificado'}</span>
            </div>
            <div class="user-detail">
                <strong>📅 Fecha de registro:</strong>
                <span>${createdDate}</span>
            </div>
        </div>
        
        <div class="user-card-actions">
            <button class="btn-approve" onclick="handleApproveUser(${user.id}, '${user.username}')">
                ✅ Aprobar Usuario
            </button>
            <button class="btn-reject" onclick="handleRejectUser(${user.id}, '${user.username}')">
                ❌ Rechazar
            </button>
        </div>
    `;
    
    return card;
}

/**
 * Aprobar usuario
 */
export async function approveUser(userId, username) {
    const card = document.getElementById(`user-card-${userId}`);
    if (!card) return;
    
    // Deshabilitar botones
    const buttons = card.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    // Mostrar loading
    const actionsDiv = card.querySelector('.user-card-actions');
    actionsDiv.innerHTML = '<div class="loading-spinner"></div> Aprobando...';
    
    try {
        const response = await axios.post(
            `${API_BASE_URL}/auth/users/${userId}/approve/`,
            {},
            getAxiosConfig()
        );
        
        // Mostrar mensaje de éxito
        card.classList.add('approved');
        actionsDiv.innerHTML = `
            <div class="success-message">
                ✅ Usuario aprobado. Se ha enviado un email de confirmación.
            </div>
        `;
        
        // Actualizar badge
        const badge = card.querySelector('.status-badge');
        badge.className = 'status-badge approved';
        badge.textContent = '✅ Aprobado';
        
        // Remover de la lista después de 2 segundos
        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                card.remove();
                
                // Si no quedan más usuarios, mostrar mensaje
                const container = document.getElementById('pending-users-container');
                if (container && container.children.length === 0) {
                    loadPendingUsers();
                }
                
                // Actualizar contador
                updatePendingCount();
            }, 500);
        }, 2000);
        
    } catch (error) {
        console.error('Error aprobando usuario:', error);
        
        // Mostrar error
        actionsDiv.innerHTML = `
            <div class="error-message">
                ❌ Error: ${error.response?.data?.error || error.message}
            </div>
        `;
        
        // Restaurar botones después de 3 segundos
        setTimeout(() => {
            actionsDiv.innerHTML = `
                <button class="btn-approve" onclick="handleApproveUser(${userId}, '${username}')">
                    ✅ Aprobar Usuario
                </button>
                <button class="btn-reject" onclick="handleRejectUser(${userId}, '${username}')">
                    ❌ Rechazar
                </button>
            `;
        }, 3000);
    }
}

/**
 * Rechazar usuario (desactivar cuenta)
 */
export async function rejectUser(userId, username) {
    const card = document.getElementById(`user-card-${userId}`);
    if (!card) return;
    
    // Deshabilitar botones
    const buttons = card.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    // Mostrar loading
    const actionsDiv = card.querySelector('.user-card-actions');
    actionsDiv.innerHTML = '<div class="loading-spinner"></div> Rechazando...';
    
    try {
        const response = await axios.post(
            `${API_BASE_URL}/auth/users/${userId}/toggle_active/`,
            {},
            getAxiosConfig()
        );
        
        // Mostrar mensaje de éxito
        actionsDiv.innerHTML = `
            <div class="success-message">
                ✅ Usuario rechazado y desactivado
            </div>
        `;
        
        // Remover de la lista después de 2 segundos
        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                card.remove();
                
                // Si no quedan más usuarios, mostrar mensaje
                const container = document.getElementById('pending-users-container');
                if (container && container.children.length === 0) {
                    loadPendingUsers();
                }
                
                // Actualizar contador
                updatePendingCount();
            }, 500);
        }, 2000);
        
    } catch (error) {
        console.error('Error rechazando usuario:', error);
        
        // Mostrar error
        actionsDiv.innerHTML = `
            <div class="error-message">
                ❌ Error: ${error.response?.data?.error || error.message}
            </div>
        `;
        
        // Restaurar botones después de 3 segundos
        setTimeout(() => {
            actionsDiv.innerHTML = `
                <button class="btn-approve" onclick="handleApproveUser(${userId}, '${username}')">
                    ✅ Aprobar Usuario
                </button>
                <button class="btn-reject" onclick="handleRejectUser(${userId}, '${username}')">
                    ❌ Rechazar
                </button>
            `;
        }, 3000);
    }
}

/**
 * Actualizar contador de usuarios pendientes
 */
async function updatePendingCount() {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/auth/users/pending/`,
            getAxiosConfig()
        );
        
        const count = response.data.count || 0;
        const countSpan = document.getElementById('pending-count');
        if (countSpan) {
            countSpan.textContent = count;
        }
    } catch (error) {
        console.error('Error actualizando contador:', error);
    }
}

/**
 * Funciones globales para ser llamadas desde HTML
 */
window.handleApproveUser = function(userId, username) {
    if (confirm(`¿Aprobar al usuario "${username}"?\n\nSe enviará un email de confirmación al usuario.`)) {
        approveUser(userId, username);
    }
};

window.handleRejectUser = function(userId, username) {
    if (confirm(`¿Rechazar al usuario "${username}"?\n\nLa cuenta será desactivada y no podrá iniciar sesión.`)) {
        rejectUser(userId, username);
    }
};

window.handleRefreshPendingUsers = function() {
    loadPendingUsers();
};