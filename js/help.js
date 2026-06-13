import { getCurrentUser } from './auth.js';

export function updateHelpButtonVisibility() {
    const helpButton = document.getElementById('help-button');
    if (!helpButton) return;

    const currentUser = getCurrentUser();
    helpButton.style.display = (currentUser && currentUser.is_approved) ? 'flex' : 'none';
}
