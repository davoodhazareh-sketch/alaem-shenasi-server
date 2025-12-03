import { UserProfile, HistoryItem } from '../types';

// Points to the 'api' folder where PHP scripts should be located
const API_BASE_URL = '/api'; 

export const api = {
    async register(user: Partial<UserProfile> & { password?: string }) {
        const response = await fetch(`${API_BASE_URL}/register.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user),
        });
        return response.json();
    },

    async login(user: { username: string; password?: string }) {
        const response = await fetch(`${API_BASE_URL}/login.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user),
        });
        return response.json();
    },

    async saveHistory(userId: number, item: any) {
        const response = await fetch(`${API_BASE_URL}/save_history.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, item }),
        });
        return response.json();
    },

    async getHistory(userId: number) {
        const response = await fetch(`${API_BASE_URL}/get_history.php?user_id=${userId}`);
        return response.json();
    }
};
