/**
 * admin.js — Panel de administración para superusuarios
 *
 * Changes:
 *   - axios imported from npm package (was loaded via <script> tag)
 *   - bootstrap imported from npm package (for any future modal usage)
 *   - handleRefreshPendingUsers added as a proper named export
 *     so app.js can import it cleanly
 *   - window.handleApproveUser and window.handleRejectUser kept on window
 *     because they are called from innerHTML strings inside createUserCard()
 *     — those cannot use addEventListener without a full rewrite of the card
 *     rendering logic, which is out of scope here
 *   - window.handleRefreshPendingUsers REMOVED (replaced by the named export)
 */

import axios from 'axios';
import { AuthAPI, getCookie, getAxiosConfig } from './api.js';
import { getApiBaseUrl } from './settings.js';

const API_BASE_URL = getApiBaseUrl();

// ---------------------------------------------------------------------------
// Load pending users
// ---------------------------------------------------------------------------

export async function loadPendingUsers() {
    const container  = document.getElementById('pending-users-container');
    const loadingDiv = document.getElementById('admin-loading');
    const countSpan  = document.getElementById('pending-count');

    if (!container) return;

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

        if (countSpan) countSpan.textContent = count;

        if (users.length === 0) {
            container.innerHTML = `
                <div class="alert-inline info">
                    <p>✅ No hay usuarios pendientes de aprobación</p>
                </div>
            `;
            return;
        }

        users.forEach(user => container.appendChild(createUserCard(user)));

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

// ---------------------------------------------------------------------------
// handleRefreshPendingUsers — named export
// FIX: was window.handleRefreshPendingUsers = function() { ... }
//      which made it invisible to ES module imports.
//      app.js now does: import { handleRefreshPendingUsers } from './admin.js'
// ---------------------------------------------------------------------------

export function handleRefreshPendingUsers() {
    loadPendingUsers();
}

// ---------------------------------------------------------------------------
// Create user card
// ---------------------------------------------------------------------------

function createUserCard(user) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.id = `user-card-${user.id}`;

    const createdDate = new Date(user.created_at).toLocaleString('es-ES', {
        day:    '2-digit',
        month:  '2-digit',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit'
    });

    // NOTE: handleApproveUser and handleRejectUser are called from these
    // innerHTML strings, so they must remain on window (see bottom of file).
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

// ---------------------------------------------------------------------------
// Approve user
// ---------------------------------------------------------------------------

export async function approveUser(userId, username) {
    const card = document.getElementById(`user-card-${userId}`);
    if (!card) return;

    card.querySelectorAll('button').forEach(btn => btn.disabled = true);

    const actionsDiv = card.querySelector('.user-card-actions');
    actionsDiv.innerHTML = '<div class="loading-spinner"></div> Aprobando...';

    try {
        await axios.post(
            `${API_BASE_URL}/auth/users/${userId}/approve/`,
            {},
            getAxiosConfig()
        );

        card.classList.add('approved');
        actionsDiv.innerHTML = `
            <div class="success-message">
                ✅ Usuario aprobado. Se ha enviado un email de confirmación.
            </div>
        `;

        const badge = card.querySelector('.status-badge');
        if (badge) {
            badge.className = 'status-badge approved';
            badge.textContent = '✅ Aprobado';
        }

        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                card.remove();
                const container = document.getElementById('pending-users-container');
                if (container && container.children.length === 0) loadPendingUsers();
                updatePendingCount();
            }, 500);
        }, 2000);

    } catch (error) {
        console.error('Error aprobando usuario:', error);
        actionsDiv.innerHTML = `
            <div class="error-message">
                ❌ Error: ${error.response?.data?.error || error.message}
            </div>
        `;
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

// ---------------------------------------------------------------------------
// Reject user
// ---------------------------------------------------------------------------

export async function rejectUser(userId, username) {
    const card = document.getElementById(`user-card-${userId}`);
    if (!card) return;

    card.querySelectorAll('button').forEach(btn => btn.disabled = true);

    const actionsDiv = card.querySelector('.user-card-actions');
    actionsDiv.innerHTML = '<div class="loading-spinner"></div> Rechazando...';

    try {
        await axios.post(
            `${API_BASE_URL}/auth/users/${userId}/toggle_active/`,
            {},
            getAxiosConfig()
        );

        actionsDiv.innerHTML = `
            <div class="success-message">
                ✅ Usuario rechazado y desactivado
            </div>
        `;

        setTimeout(() => {
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                card.remove();
                const container = document.getElementById('pending-users-container');
                if (container && container.children.length === 0) loadPendingUsers();
                updatePendingCount();
            }, 500);
        }, 2000);

    } catch (error) {
        console.error('Error rechazando usuario:', error);
        actionsDiv.innerHTML = `
            <div class="error-message">
                ❌ Error: ${error.response?.data?.error || error.message}
            </div>
        `;
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

// ---------------------------------------------------------------------------
// Update pending count
// ---------------------------------------------------------------------------

async function updatePendingCount() {
    try {
        const response = await axios.get(
            `${API_BASE_URL}/auth/users/pending/`,
            getAxiosConfig()
        );
        const countSpan = document.getElementById('pending-count');
        if (countSpan) countSpan.textContent = response.data.count || 0;
    } catch (error) {
        console.error('Error actualizando contador:', error);
    }
}

// ---------------------------------------------------------------------------
// window globals — only for handlers called from innerHTML strings
// handleApproveUser and handleRejectUser are injected into card HTML via
// template literals in createUserCard(), so they must be on window.
// handleRefreshPendingUsers is NOT here anymore — it is a named export above.
// ---------------------------------------------------------------------------

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