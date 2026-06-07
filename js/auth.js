/**
 * Auth Module - Sistema de autenticación
 */

import { AuthAPI } from './api.js';
import { updateHelpButtonVisibility } from './help.js';
//import axios from 'axios';

// Estado global del usuario
let currentUser = null;

/**
 * ====================================
 * GESTIÓN DE SESIÓN
 * ====================================
 */

/**
 * Guardar credenciales en localStorage (si "recordar" está activado)
 */
function saveCredentials(username, password) {
    if (localStorage) {
        localStorage.setItem('saved_username', username);
        // NO guardar contraseña en texto plano
        localStorage.setItem('remember_me', 'true');
    }
}

/**
 * Cargar credenciales guardadas
 */
function loadSavedCredentials() {
    if (localStorage && localStorage.getItem('remember_me') === 'true') {
        return {
            username: localStorage.getItem('saved_username') || '',
            remember: true
        };
    }
    return { username: '', remember: false };
}

/**
 * Limpiar credenciales guardadas
 */
function clearSavedCredentials() {
    if (localStorage) {
        localStorage.removeItem('saved_username');
        localStorage.removeItem('remember_me');
    }
}

/**
 * Verificar si hay sesión activa
 */
export async function checkSession() {
    const result = await AuthAPI.getCurrentUser();
    
    if (result.success) {
        currentUser = result.data;
        return true;
    }
    
    currentUser = null;
    return false;
}

/**
 * Obtener usuario actual
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * ====================================
 * INICIALIZACIÓN DE PÁGINA DE LOGIN
 * ====================================
 */

export function initLoginPage() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const showLoginBtn = document.getElementById('show-login-btn');
    const loginContainer = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');

    // Cargar credenciales guardadas
    const saved = loadSavedCredentials();
    if (saved.username) {
        document.getElementById('login-username').value = saved.username;
        document.getElementById('remember-me').checked = saved.remember;
    }

    // Cambiar entre login y registro
    showRegisterBtn.addEventListener('click', () => {
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    });

    showLoginBtn.addEventListener('click', () => {
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    });

    // Manejar login
    loginForm.addEventListener('submit', handleLogin);

    // Manejar registro
    registerForm.addEventListener('submit', handleRegister);
}

/**
 * ====================================
 * MANEJO DE LOGIN
 * ====================================
 */


export async function handleLogin(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('login-submit-btn');
    const alertDiv = document.getElementById('login-alert');
    
    // Obtener datos del formulario
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;

    // Validación básica
    if (!username || !password) {
        showAlert(alertDiv, 'Por favor completa todos los campos', 'error');
        return;
    }

    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Iniciando sesión...';

    try {
        // ⭐ PASO 1: Obtener token CSRF PRIMERO
        console.log('🔐 Paso 1: Obteniendo CSRF token...');
        const csrfResult = await AuthAPI.getCSRFToken();
        
        if (!csrfResult.success) {
            showAlert(alertDiv, 'Error al obtener token de seguridad. Recarga la página.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Iniciar Sesión';
            return;
        }

        // ⭐ PASO 2: Intentar login con el token obtenido
        console.log('🔐 Paso 2: Intentando login...');
        const result = await AuthAPI.login(username, password);

        if (result.success) {
            // Guardar credenciales si está marcado "recordar"
            if (remember) {
                saveCredentials(username, password);
            } else {
                clearSavedCredentials();
            }

            // Guardar usuario
            currentUser = result.data.user;

            // Mostrar mensaje de éxito
            showAlert(alertDiv, 'Sesión iniciada. Redirigiendo...', 'success');

            // Redirigir después de 1 segundo
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            // Mostrar error
            showAlert(alertDiv, result.error, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Iniciar Sesión';
        }
    } catch (error) {
        console.error('❌ Error inesperado en login:', error);
        showAlert(alertDiv, 'Error inesperado. Por favor intenta nuevamente.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Iniciar Sesión';
    }
}

/**
 * ====================================
 * MANEJO DE REGISTRO
 * ====================================
 */

export async function handleRegister(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('register-submit-btn');
    const alertDiv = document.getElementById('register-alert');
    
    // Obtener datos del formulario
    const formData = {
        username: document.getElementById('register-username').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        first_name: document.getElementById('register-firstname').value.trim(),
        last_name: document.getElementById('register-lastname').value.trim(),
        organismo: document.getElementById('register-organismo').value.trim(),
        password: document.getElementById('register-password').value,
        password2: document.getElementById('register-password2').value
    };

    // Validaciones básicas
    if (!formData.username || !formData.email || !formData.first_name || 
        !formData.last_name || !formData.password || !formData.password2) {
        showAlert(alertDiv, 'Por favor completa todos los campos obligatorios (*)', 'error');
        return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        showAlert(alertDiv, 'Por favor ingresa un email válido', 'error');
        return;
    }

    // Validar contraseñas coincidan
    if (formData.password !== formData.password2) {
        showAlert(alertDiv, 'Las contraseñas no coinciden', 'error');
        return;
    }

    // Validar longitud de contraseña
    if (formData.password.length < 8) {
        showAlert(alertDiv, 'La contraseña debe tener al menos 8 caracteres', 'error');
        return;
    }

    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Registrando...';

    // Llamar API
    const result = await AuthAPI.register(formData);

    if (result.success) {
        // Mostrar mensaje de éxito
        showAlert(alertDiv, 
            '✅ Registro exitoso. Tu cuenta está pendiente de aprobación por el administrador. ' +
            'Serás redirigido al login...', 
            'success'
        );

        // Redirigir al login después de 3 segundos
        setTimeout(() => {
            document.getElementById('show-login-btn').click();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirmar Registro';
            e.target.reset();
        }, 3000);
    } else {
        // Mostrar error
        showAlert(alertDiv, result.error, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Registro';
    }
}

/**
 * ====================================
 * INICIALIZACIÓN EN INDEX.HTML
 * ====================================
 */

export async function initAuthButton() {
    const authButton = document.getElementById('auth-button');
    const authButtonText = document.getElementById('auth-button-text');
    const editorPanel = document.getElementById('editor-panel');
    const superuserMenuItem = document.getElementById('superuser-menu-item');

    // Verificar sesión actual
    const isAuthenticated = await checkSession();

    if (isAuthenticated) {
        // Usuario autenticado
        authButtonText.textContent = 'Cerrar sesión';
        authButton.onclick = handleLogout;

         // Mostrar pestaña de superusuario si es superuser
        if (currentUser.is_superuser && superuserMenuItem) {
            superuserMenuItem.style.display = 'block';
        }

        updateHelpButtonVisibility();

        // Verificar permisos
        if (currentUser.is_approved) {
            // Usuario aprobado: mostrar editor
            if (editorPanel) {
                editorPanel.style.display = 'block';
                // Inicializar editor (se hace en editor.js)
            }
        } else {
            // Usuario NO aprobado: mostrar mensaje
            if (editorPanel) {
                editorPanel.style.display = 'block';
                const editorContent = document.getElementById('editor-content');
                editorContent.innerHTML = `
                    <div class="alert-inline warning">
                        <p>⚠️ <strong>Tu cuenta está pendiente de aprobación por el administrador.</strong></p>
                        <p>Una vez aprobada, podrás crear y editar eventos.</p>
                        <button onclick="location.reload()" class="btn btn-outline-secondary">
                            🔄 Verificar estado
                        </button>
                    </div>
                `;
            }
        }
    } else {
        // Usuario NO autenticado
        authButtonText.textContent = 'Iniciar sesión';
        authButton.onclick = () => {
            window.location.href = 'login.html';
        };

        // Ocultar editor
        if (editorPanel) {
            editorPanel.style.display = 'none';
        }

        if (superuserMenuItem) {
            superuserMenuItem.style.display = 'none';
        }
        updateHelpButtonVisibility();
    }
}

/**
 * Manejar logout
 */
export async function handleLogout() {
    const confirmLogout = confirm('¿Estás seguro de que deseas cerrar sesión?');
    
    if (confirmLogout) {
        const result = await AuthAPI.logout();
        
        if (result.success) {
            currentUser = null;
            clearSavedCredentials();
            window.location.reload();
        } else {
            alert('Error al cerrar sesión: ' + result.error);
        }
    }
}

/**
 * ====================================
 * UTILIDADES
 * ====================================
 */

/**
 * Mostrar alerta en página de login
 */
function showAlert(alertDiv, message, type = 'info') {
    alertDiv.className = `alert-inline ${type}`;
    alertDiv.innerHTML = message;
    alertDiv.style.display = 'block';

    // Auto-ocultar después de 10 segundos (excepto éxito)
    if (type !== 'success') {
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 10000);
    }
}

/**
 * Verificar si el usuario tiene permisos para editar
 */
export function canEdit() {
    return currentUser && currentUser.is_approved;
}

/**
 * Verificar si el usuario es superusuario
 */
export function isSuperUser() {
    return currentUser && currentUser.is_superuser;
}