import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider,
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    onSnapshot,
    collection,
    query,
    where 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyC-89-OKNFzI6-Ixsn-JnyETX-H97q-DmE",
    authDomain: "rutine-14188.firebaseapp.com",
    databaseURL: "https://rutine-14188-default-rtdb.firebaseio.com",
    projectId: "rutine-14188",
    storageBucket: "rutine-14188.firebasestorage.app",
    messagingSenderId: "626441717008",
    appId: "1:626441717008:web:70850934cfdcc21ac35195",
    measurementId: "G-N9YMF6ZY6S"
};

class HabitTracker {
    constructor() {
        // Initialize Firebase
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        
        this.habits = JSON.parse(localStorage.getItem('localHabits')) || []; // Habits will be user-specific
        this.theme = localStorage.getItem('theme') || 'dark';
        this.currentHabitType = 'daily';
        this.selectedIcon = '💧';
        this.selectedColor = '#ffffff';
        this.user = null;
        this.unsubscribe = null;

        this.init();
    }

    init() {
        this.initMouseTracking();
        this.setupAuthListeners();
        this.setupUIListeners();
        this.applyTheme();
        this.startCountdownTimer();
        
        // Immediate render from localStorage (fast-path)
        this.renderGrid();
        
        // Handle guest mode visibility immediately if not waiting for auth
        if (localStorage.getItem('guestMode') === 'true') {
            document.body.classList.add('authenticated');
        }
    }

    startCountdownTimer() {
        setInterval(() => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setHours(24, 0, 0, 0);
            const diff = Math.floor((tomorrow - now) / 1000); // total seconds remaining
            
            const hours = Math.floor(diff / 3600);
            const minutes = Math.floor((diff % 3600) / 60);
            const seconds = diff % 60;
            
            const timerEl = document.getElementById('countdown-timer');
            if (timerEl) {
                timerEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    setupAuthListeners() {
        onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                this.user = user;
                document.body.classList.add('authenticated');
                
                // Update User Profile UI
                const userDp = document.getElementById('user-dp');
                const userName = document.getElementById('user-name');
                if (userDp) {
                    userDp.src = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email || 'aura'}`;
                }
                if (userName) {
                    userName.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
                }
                
                // Real-time listener for user habits
                if (this.unsubscribe) this.unsubscribe();
                this.unsubscribe = onSnapshot(doc(this.db, "users", user.uid), (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        // Only update if we don't have local unsynced changes or if cloud is newer
                        // For simplicity, we trust cloud as source of truth once logged in
                        this.habits = data.habits || [];
                        if (data.theme) {
                            this.theme = data.theme;
                            this.applyTheme();
                            localStorage.setItem('theme', this.theme);
                        }
                    } else {
                        // Document doesn't exist in Firestore yet.
                        // If we have local habits, migrate them to the cloud.
                        if (this.habits.length > 0) {
                            this.persist();
                        } else {
                            this.habits = [];
                        }
                    }
                    this.renderGrid();
                    this.renderAnalytics();
                });

            } else {
                if (this.unsubscribe) this.unsubscribe();
                this.user = null;
                // Check if user previously chose to continue as guest
                const isGuest = localStorage.getItem('guestMode') === 'true';
                if (isGuest) {
                    document.body.classList.add('authenticated');
                } else {
                    document.body.classList.remove('authenticated');
                }
                this.habits = JSON.parse(localStorage.getItem('localHabits')) || [];
                this.renderGrid();
            }
        });

        // Auth Form Actions
        document.getElementById('btn-login').onclick = () => this.handleEmailLogin();
        document.getElementById('btn-signup').onclick = () => this.handleEmailSignup();
        document.getElementById('btn-google').onclick = () => this.handleGoogleLogin();
        document.getElementById('btn-logout').onclick = () => {
            if(confirm('Ready to sign out?')) {
                localStorage.removeItem('guestMode');
                signOut(this.auth);
            }
        };

        // Global toggle for auth mode
        window.toggleAuthMode = (mode) => {
            const loginForm = document.getElementById('login-form');
            const signupForm = document.getElementById('signup-form');
            
            if (mode === 'signup') {
                loginForm.classList.add('form-fade-out');
                setTimeout(() => {
                    loginForm.style.display = 'none';
                    signupForm.style.display = 'block';
                    signupForm.classList.remove('form-fade-out');
                    signupForm.classList.add('form-fade-in');
                }, 300);
            } else {
                signupForm.classList.add('form-fade-out');
                setTimeout(() => {
                    signupForm.style.display = 'none';
                    loginForm.style.display = 'block';
                    loginForm.classList.remove('form-fade-out');
                    loginForm.classList.add('form-fade-in');
                }, 300);
            }
        };
    }

    async handleEmailLogin() {
        const btn = document.getElementById('btn-login');
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        
        if (!email || !pass) return;
        
        btn.classList.add('loading');
        try {
            await signInWithEmailAndPassword(this.auth, email, pass);
        } catch (error) {
            this.showToast("ACCESS DENIED", error.message);
        } finally {
            btn.classList.remove('loading');
        }
    }

    async handleEmailSignup() {
        const btn = document.getElementById('btn-signup');
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-password').value;
        
        if (!email || !pass) return;

        btn.classList.add('loading');
        try {
            await createUserWithEmailAndPassword(this.auth, email, pass);
        } catch (error) {
            this.showToast("REGISTRATION FAILED", error.message);
        } finally {
            btn.classList.remove('loading');
        }
    }

    async handleGoogleLogin() {
        const provider = new GoogleAuthProvider();
        try {
            // Clear guest mode when logging in
            localStorage.removeItem('guestMode');
            await signInWithPopup(this.auth, provider);
        } catch (error) {
            alert("GOOGLE AUTH FAILED: " + error.message);
        }
    }

    continueAsGuest() {
        localStorage.setItem('guestMode', 'true');
        document.body.classList.add('authenticated');
        this.renderGrid();
    }

    setupUIListeners() {
        document.getElementById('btn-create-habit').onclick = () => this.toggleModal('habit-modal', true);
        
        const settingsBtn = document.getElementById('btn-settings-nav');
        const settingsBtnMobile = document.getElementById('btn-settings-mobile');
        if (settingsBtn) settingsBtn.onclick = () => this.toggleModal('settings-modal', true);
        if (settingsBtnMobile) settingsBtnMobile.onclick = () => this.toggleModal('settings-modal', true);

        // Sidebar Navigation Handling
        const navItems = document.querySelectorAll('.nav-item[data-target]');
        navItems.forEach(item => {
            item.onclick = () => {
                const targetId = item.getAttribute('data-target');
                
                // Update active state for all nav items with the same target
                navItems.forEach(i => {
                    if (i.getAttribute('data-target') === targetId) {
                        i.classList.add('active');
                    } else {
                        i.classList.remove('active');
                    }
                });
                
                // Close modals when navigating
                this.toggleModal('settings-modal', false);
                this.toggleModal('habit-modal', false);
                
                if (targetId) {
                    const views = ['view-dashboard', 'view-analytics', 'view-momentum', 'view-sunday-sync'];
                    views.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = 'none';
                    });
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        targetEl.style.display = ''; // Restore default display from CSS
                    }

                    // Refresh specific views when navigated
                    if (targetId === 'view-analytics') this.renderCharts();
                    if (targetId === 'view-momentum') this.renderMomentum();
                    if (targetId === 'view-sunday-sync') this.renderSundaySync();
                }
            };
        });

        document.getElementById('save-habit').onclick = () => this.saveHabit();
        document.getElementById('toggle-theme').onclick = () => this.toggleTheme();
        
        window.closeHabitModal = () => this.toggleModal('habit-modal', false);
        window.closeSettings = () => this.toggleModal('settings-modal', false);
        window.setHabitType = (type) => this.currentHabitType = type;
        
        window.clearAllData = () => {
            if(confirm('Wipe all data? This will permanently delete all your habits and history.')) {
                this.habits = [];
                this.persist();
                this.renderGrid();
                this.showToast('Data Wiped', 'System Reset');
            }
        };

        window.deleteHabit = (id) => {
            if(confirm('Delete this protocol?')) {
                this.habits = this.habits.filter(h => h.id !== id);
                this.persist();
                this.renderGrid();
                this.showToast('Protocol Terminated', 'Deleted');
            }
        };

        window.exportData = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.habits, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "rutine_backup.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        };

        window.continueAsGuest = () => this.continueAsGuest();
        window.editHabit = (id) => this.editHabit(id);

        this.renderIcons();
        this.renderColors();
    }

    initMouseTracking() {
        document.addEventListener('mousemove', (e) => {
            document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);

            const buttons = document.querySelectorAll('.btn-liquid');
            buttons.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                btn.style.setProperty('--mouse-x-rel', `${x}px`);
                btn.style.setProperty('--mouse-y-rel', `${y}px`);
            });
        });
    }

    renderIcons() {
        const icons = [
            '💧', '🏃', '🏋️', '📚', '🧘', '💻', '🧹', '🙏', '😴', '🥗', 
            '💊', '🚶', '🚴', '🎨', '✍️', '🍎', '🦷', '🛀', '☀️', '🌙', 
            '📱', '🚫', '💰', '🧠', '🌿', '🚿', '📈', '🎵', '🍳', '🛒',
            '👟', '👞', '🚗', '🛵', '🧼', '🧖', '💆', '🗿', '💅', '🪒',
            '🔋', '🕯️', '🍵', '🎒', '📸', '🔑', '🏠', '🌍', '🔥', '💎',
            '✦', '❃', '◈', '♨', '☾', '☀', '⚡', '✿', '★', '♥'
        ];
        const container = document.getElementById('icon-selector');
        if(!container) return;
        container.innerHTML = icons.map(icon => `
            <div class="icon-item ${this.selectedIcon === icon ? 'active' : ''}" 
                 onclick="tracker.setSelectedIcon('${icon}', this)">
                ${icon}
            </div>
        `).join('');
    }

    setSelectedIcon(icon, el) {
        this.selectedIcon = icon;
        document.querySelectorAll('.icon-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
    }

    renderColors() {
        const colors = ['#3C82F6', '#06B6D4', '#A855F7', '#EC4899', '#10B981'];
        const container = document.getElementById('color-selector');
        if(!container) return;
        container.innerHTML = colors.map(color => `
            <div class="color-option ${this.selectedColor === color ? 'active' : ''}" 
                 style="background: ${color};" 
                 onclick="tracker.setSelectedColor('${color}', this)">
            </div>
        `).join('');
    }

    setSelectedColor(color, el) {
        this.selectedColor = color;
        document.querySelectorAll('.color-option').forEach(d => d.classList.remove('active'));
        el.classList.add('active');
    }

    saveHabit() {
        const nameInput = document.getElementById('habit-name');
        if (!nameInput.value) return;

        const categorySelect = document.getElementById('habit-category');
        const category = categorySelect ? categorySelect.value : 'Mind';
        const editId = document.getElementById('edit-habit-id').value;

        if (editId) {
            // Update existing habit
            const habitIndex = this.habits.findIndex(h => h.id === parseInt(editId));
            if (habitIndex !== -1) {
                this.habits[habitIndex].name = nameInput.value;
                this.habits[habitIndex].category = category;
                this.habits[habitIndex].icon = this.selectedIcon;
                this.habits[habitIndex].color = this.selectedColor;
            }
        } else {
            // Create new habit
            const newHabit = {
                id: Date.now(),
                name: nameInput.value,
                category: category,
                type: this.currentHabitType,
                icon: this.selectedIcon,
                color: this.selectedColor,
                history: {}
            };
            this.habits.push(newHabit);
        }

        this.persist();
        this.renderGrid();
        this.toggleModal('habit-modal', false);
        this.resetModal();

        const account = this.user ? this.user.email : 'Local Device (Not Logged In)';
        this.showToast(editId ? 'Protocol Updated' : 'Protocol Initialized', account);
    }

    editHabit(id) {
        const habit = this.habits.find(h => h.id === id);
        if (!habit) return;

        document.getElementById('modal-title').textContent = 'Edit Protocol';
        document.getElementById('edit-habit-id').value = habit.id;
        document.getElementById('habit-name').value = habit.name;
        document.getElementById('habit-category').value = habit.category;
        
        this.selectedIcon = habit.icon;
        this.selectedColor = habit.color;
        
        this.renderIcons();
        this.renderColors();
        this.toggleModal('habit-modal', true);
    }

    resetModal() {
        document.getElementById('modal-title').textContent = 'Add New Protocol';
        document.getElementById('edit-habit-id').value = '';
        document.getElementById('habit-name').value = '';
        document.getElementById('habit-category').value = 'Mind';
        this.selectedIcon = '💧';
        this.selectedColor = '#3C82F6';
        this.renderIcons();
        this.renderColors();
    }

    showToast(title, message) {
        const toast = document.getElementById('toast-container');
        if (!toast) return;
        
        const titleEl = document.getElementById('toast-title');
        const msgEl = document.getElementById('toast-message');
        if(titleEl) titleEl.textContent = title;
        if(msgEl) msgEl.textContent = message;
        
        toast.classList.remove('show');
        void toast.offsetWidth; // trigger reflow
        toast.classList.add('show');
        
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    toggleModal(id, show) {
        const modal = document.getElementById(id);
        if (show) {
            modal.style.display = 'block';
            modal.style.animation = 'modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        } else {
            modal.style.animation = 'modalFadeOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.animation = '';
            }, 300);
        }
    }

    renderGrid() {
        const list = document.getElementById('habit-list');
        if(!list) return;
        
        // Calculate dates for current week starting Monday
        const now = new Date();
        const currentDay = now.getDay(); // 0 (Sun) to 6 (Sat)
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + mondayOffset + i);
            days.push(d);
        }

        const header = document.getElementById('grid-header');
        if (header) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            header.innerHTML = `
                <th style="text-align: left; padding-left: 2rem;">Protocol Identity</th>
                ${days.map(d => {
                    const isToday = d.toDateString() === now.toDateString();
                    return `
                    <th>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; position: relative;">
                            <span style="font-size: 0.6rem; opacity: 0.5; letter-spacing: 1px; ${isToday ? 'color: #4facfe; opacity: 1;' : ''}">${dayNames[d.getDay()]}</span>
                            <span style="font-size: 1.1rem; font-weight: 700; ${isToday ? 'color: #4facfe; text-shadow: 0 0 15px rgba(79, 172, 254, 0.4);' : 'color: var(--text-color);'}">${d.getDate()}</span>
                            ${isToday ? '<div style="position: absolute; bottom: -12px; width: 4px; height: 4px; background: #4facfe; border-radius: 50%; box-shadow: 0 0 10px #4facfe;"></div>' : ''}
                        </div>
                    </th>
                    `;
                }).join('')}
            `;
        }

        list.innerHTML = this.habits.map(habit => `
            <tr class="habit-row">
                <td>
                    <div class="protocol-cell">
                        <span class="protocol-icon">${habit.icon}</span>
                        <div style="display: flex; flex-direction: column;">
                            <span>${habit.name}</span>
                            <span style="font-size: 0.6rem; opacity: 0.4; text-transform: uppercase;">${habit.category}</span>
                        </div>
                        <div style="margin-left: auto; display: flex; gap: 0.5rem;">
                            <button class="btn-edit" onclick="editHabit(${habit.id})" title="Edit Protocol">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="btn-delete" onclick="deleteHabit(${habit.id})" title="Delete Protocol">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>
                </td>
                ${days.map(d => {
                    const dateKey = d.toISOString().split('T')[0];
                    const active = habit.history && habit.history[dateKey] ? 'active' : '';
                    return `<td><div class="cell-check ${active}" onclick="tracker.toggleDate(${habit.id}, '${dateKey}')"></div></td>`;
                }).join('')}
            </tr>
        `).join('');

        this.renderCharts();
    }

    renderCharts() {
        this.renderLineChart();
        this.renderMonthlyLineChart();
        this.renderDonutChart();
        this.renderRadarChart();
        
        // Refresh other views if active
        if (document.getElementById('view-momentum') && document.getElementById('view-momentum').style.display !== 'none') this.renderMomentum();
        if (document.getElementById('view-sunday-sync') && document.getElementById('view-sunday-sync').style.display !== 'none') this.renderSundaySync();
    }

    renderLineChart() {
        const svg = document.getElementById('line-chart-svg');
        const path = document.getElementById('line-path');
        const area = document.getElementById('line-area');
        const pointsContainer = document.getElementById('line-points');
        const labelsContainer = document.getElementById('line-labels');
        const gridContainer = document.getElementById('line-grid');
        if (!svg) return;

        const data = [];
        const labels = [];
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        const now = new Date();
        const currentDay = now.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + mondayOffset + i);
            const dateKey = d.toISOString().split('T')[0];
            
            labels.push(`${dayNames[i]} ${d.getDate()}`);
            
            let possible = this.habits.length;
            let completed = 0;
            if (possible > 0) {
                this.habits.forEach(h => {
                    if (h.history && h.history[dateKey]) completed++;
                });
                data.push((completed / possible) * 100);
            } else {
                data.push(0);
            }
        }
        
        const width = 500;
        const height = 200;
        const padding = 40;
        const xStep = (width - padding * 2) / 6;
        
        pointsContainer.innerHTML = '';
        labelsContainer.innerHTML = '';
        gridContainer.innerHTML = '';

        let dAttr = '';
        let areaAttr = '';

        data.forEach((val, i) => {
            const x = padding + i * xStep;
            const y = height - padding - (val / 100) * (height - padding * 2);
            
            if (i === 0) {
                dAttr += `M ${x} ${y}`;
                areaAttr += `M ${x} ${height - padding} L ${x} ${y}`;
            } else {
                const prevX = padding + (i-1) * xStep;
                const prevY = height - padding - (data[i-1] / 100) * (height - padding * 2);
                const cp1x = prevX + (x - prevX) / 2;
                dAttr += ` C ${cp1x} ${prevY}, ${cp1x} ${y}, ${x} ${y}`;
                areaAttr += ` C ${cp1x} ${prevY}, ${cp1x} ${y}, ${x} ${y}`;
            }

            // Points with Glow
            pointsContainer.innerHTML += `
                <g class="chart-point-group">
                    <circle cx="${x}" cy="${y}" r="8" fill="#4facfe" fill-opacity="0.1" />
                    <circle cx="${x}" cy="${y}" r="4" class="chart-point" />
                </g>
            `;
            
            labelsContainer.innerHTML += `<text x="${x}" y="${height - 10}" text-anchor="middle" class="chart-label">${labels[i]}</text>`;
            gridContainer.innerHTML += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="rgba(255,255,255,0.03)" />`;
        });

        areaAttr += ` L ${padding + 6 * xStep} ${height - padding} Z`;
        path.setAttribute('d', dAttr);
        area.setAttribute('d', areaAttr);

        // Add a filter if it doesn't exist
        if (!svg.querySelector('#glow-filter')) {
            svg.insertAdjacentHTML('afterbegin', `
                <defs>
                    <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
            `);
        }
        path.setAttribute('filter', 'url(#glow-filter)');
    }

    renderMonthlyLineChart() {
        const svg = document.getElementById('monthly-line-chart-svg');
        const path = document.getElementById('monthly-line-path');
        const area = document.getElementById('monthly-line-area');
        const pointsContainer = document.getElementById('monthly-line-points');
        const labelsContainer = document.getElementById('monthly-line-labels');
        const gridContainer = document.getElementById('monthly-line-grid');
        if (!svg) return;

        const data = [];
        const completionCounts = [];
        const labels = [];
        const now = new Date();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        // Fetch data for the last 30 days
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            
            let possible = this.habits.length;
            let completed = 0;
            if (possible > 0) {
                this.habits.forEach(h => {
                    if (h.history && h.history[dateKey]) completed++;
                });
                completionCounts.push({ completed, possible });
                data.push((completed / possible) * 100);
            } else {
                completionCounts.push({ completed: 0, possible: 0 });
                data.push(0);
            }
            
            // Every date label
            labels.push(`${d.getDate()} ${monthNames[d.getMonth()]}`);
        }

        const width = 1800;
        const height = 280;
        const padding = 50;
        const xStep = (width - padding * 2) / 29;
        
        pointsContainer.innerHTML = '';
        labelsContainer.innerHTML = '';
        gridContainer.innerHTML = '';

        let dAttr = '';
        let areaAttr = '';

        data.forEach((val, i) => {
            const x = padding + i * xStep;
            const y = height - padding - (val / 100) * (height - padding * 2) - 20; // Shift up for labels
            
            if (i === 0) {
                dAttr += `M ${x} ${y}`;
                areaAttr += `M ${x} ${height - padding} L ${x} ${y}`;
            } else {
                const prevX = padding + (i-1) * xStep;
                const prevY = height - padding - (data[i-1] / 100) * (height - padding * 2) - 20;
                const cp1x = prevX + (x - prevX) / 2;
                dAttr += ` C ${cp1x} ${prevY}, ${cp1x} ${y}, ${x} ${y}`;
                areaAttr += ` C ${cp1x} ${prevY}, ${cp1x} ${y}, ${x} ${y}`;
            }

            // Dots
            pointsContainer.innerHTML += `
                <g class="chart-point-group">
                    <circle cx="${x}" cy="${y}" r="4" class="chart-point" style="fill: #a855f7;" />
                </g>
            `;

            // Habits Completed Count above each dot
            const count = completionCounts[i].completed;
            labelsContainer.innerHTML += `
                <text x="${x}" y="${y - 12}" text-anchor="middle" style="fill: #a855f7; font-size: 10px; font-weight: 700; opacity: 0.9;">
                    ${count}
                </text>
            `;
            
            // Date labels at the bottom
            labelsContainer.innerHTML += `
                <text x="${x}" y="${height - 10}" text-anchor="middle" class="chart-label" style="font-size: 9px; opacity: 0.6;">
                    ${labels[i]}
                </text>
            `;

            gridContainer.innerHTML += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="rgba(255,255,255,0.03)" />`;
        });

        areaAttr += ` L ${padding + 29 * xStep} ${height - padding} Z`;
        path.setAttribute('d', dAttr);
        area.setAttribute('d', areaAttr);

        if (!svg.querySelector('#monthly-glow-filter')) {
            svg.insertAdjacentHTML('afterbegin', `
                <defs>
                    <filter id="monthly-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
            `);
        }
        path.setAttribute('filter', 'url(#monthly-glow-filter)');
    }

    renderDonutChart() {
        const segment = document.getElementById('donut-segment');
        const percentageEl = document.getElementById('donut-percentage');
        if (!segment) return;

        let possible = 0;
        let completed = 0;
        const now = new Date();
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            possible += this.habits.length;
            this.habits.forEach(h => {
                if (h.history && h.history[dateKey]) completed++;
            });
        }
        
        const percentage = possible > 0 ? (completed / possible) : 0;
        const total = 263.8; // 2 * PI * R (R=42)
        const offset = total * percentage;
        
        segment.setAttribute('stroke-dasharray', `${offset} ${total}`);
        if (percentageEl) percentageEl.textContent = `${Math.round(percentage * 100)}%`;
    }

    renderRadarChart() {
        const path = document.getElementById('radar-path');
        const grid = document.getElementById('radar-grid');
        const points = document.getElementById('radar-points');
        const labels = document.getElementById('radar-labels');
        if (!path) return;

        const categories = ['Mind', 'Body', 'Spirit', 'Work', 'Social'];
        const data = [];
        
        const now = new Date();
        const dateKeys = [];
        for (let i = 0; i < 30; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            dateKeys.push(d.toISOString().split('T')[0]);
        }
        
        categories.forEach(cat => {
            const catHabits = this.habits.filter(h => h.category === cat || (!h.category && cat === 'Mind')); // fallback to Mind if old habit
            if (catHabits.length === 0) {
                data.push(0);
                return;
            }
            
            let possible = catHabits.length * 30;
            let completed = 0;
            catHabits.forEach(h => {
                dateKeys.forEach(dk => {
                    if (h.history && h.history[dk]) completed++;
                });
            });
            data.push(completed / possible);
        });

        const center = 150;
        const radius = 100;
        const angleStep = (Math.PI * 2) / categories.length;

        grid.innerHTML = '';
        points.innerHTML = '';
        labels.innerHTML = '';

        // Draw grid
        for (let r = 1; r <= 5; r++) {
            const currentRadius = (radius / 5) * r;
            let gridPath = '';
            for (let i = 0; i <= categories.length; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const x = center + Math.cos(angle) * currentRadius;
                const y = center + Math.sin(angle) * currentRadius;
                gridPath += (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
            }
            grid.innerHTML += `<path d="${gridPath}" fill="none" stroke="rgba(255,255,255,0.05)" />`;
        }

        // Draw data path
        let dataPath = '';
        data.forEach((val, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const x = center + Math.cos(angle) * radius * val;
            const y = center + Math.sin(angle) * radius * val;
            dataPath += (i === 0 ? 'M' : 'L') + ` ${x} ${y}`;
            
            points.innerHTML += `<circle cx="${x}" cy="${y}" r="3" fill="#4facfe" />`;
            
            const labelRadius = radius + 20;
            const lx = center + Math.cos(angle) * labelRadius;
            const ly = center + Math.sin(angle) * labelRadius;
            labels.innerHTML += `<text x="${lx}" y="${ly}" text-anchor="middle" class="chart-label" style="fill: white; opacity: 0.6;">${categories[i]}</text>`;
        });
        dataPath += ' Z';
        path.setAttribute('d', dataPath);
    }

    toggleDate(habitId, dateKey) {
        const habit = this.habits.find(h => h.id === habitId);
        if (habit.history[dateKey]) {
            delete habit.history[dateKey];
        } else {
            habit.history[dateKey] = true;
        }
        this.persist();
        this.renderGrid();
        this.renderAnalytics();
    }



    renderMomentum() {
        const container = document.getElementById('momentum-list');
        if (!container) return;

        if (this.habits.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; opacity: 0.5;">No protocols initiated yet.</div>';
            return;
        }

        const now = new Date();
        const dateKeys = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            dateKeys.push(d.toISOString().split('T')[0]);
        }

        container.innerHTML = this.habits.map(habit => {
            const history = habit.history || {};
            const completedDays = dateKeys.filter(k => history[k]).length;
            const percentage = Math.round((completedDays / 30) * 100);
            
            // Calculate points for the curve using a 7-day rolling average for smooth trend
            const points = dateKeys.map((k, i) => {
                let completedInWindow = 0;
                const windowSize = 7;
                for (let j = Math.max(0, i - (windowSize - 1)); j <= i; j++) {
                    if (history[dateKeys[j]]) completedInWindow++;
                }
                const windowPercentage = completedInWindow / windowSize;
                return {
                    x: (i / 29) * 100,
                    y: 42 - (windowPercentage * 32) // Map 0-1 to 42-10 for vertical range
                };
            });

            // Generate SVG Path for smooth curve
            let dAttr = '';
            let areaAttr = '';
            
            points.forEach((p, i) => {
                if (i === 0) {
                    dAttr += `M ${p.x} ${p.y}`;
                    areaAttr += `M ${p.x} 50 L ${p.x} ${p.y}`;
                } else {
                    const prev = points[i - 1];
                    const cp1x = prev.x + (p.x - prev.x) / 2;
                    dAttr += ` C ${cp1x} ${prev.y}, ${cp1x} ${p.y}, ${p.x} ${p.y}`;
                    areaAttr += ` C ${cp1x} ${prev.y}, ${cp1x} ${p.y}, ${p.x} ${p.y}`;
                }
            });

            areaAttr += ` L 100 50 Z`;

            // Calculate velocity (last 7 days vs previous 7 days)
            const last7Count = dateKeys.slice(-7).filter(k => history[k]).length;
            const prev7Count = dateKeys.slice(-14, -7).filter(k => history[k]).length;
            const trend = last7Count - prev7Count;
            const trendColor = trend > 0 ? '#10B981' : (trend < 0 ? '#EF4444' : 'rgba(255,255,255,0.4)');
            const trendIcon = trend > 0 ? '↗' : (trend < 0 ? '↘' : '→');

            // Find current value for the glowing tip
            const currentPoint = points[points.length - 1];

            const gradientId = `grad-${habit.id}`;
            const filterId = `glow-${habit.id}`;

            return `
                <div class="momentum-card card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div class="momentum-icon-wrap" style="background: ${habit.color}15; color: ${habit.color};">
                                ${habit.icon}
                            </div>
                            <div>
                                <h4 style="font-size: 1.1rem; font-weight: 600;">${habit.name}</h4>
                                <span style="font-size: 0.7rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 1px;">${habit.category}</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
                                <span style="font-size: 0.7rem; font-weight: 700; color: ${trendColor}; opacity: 0.8;">${trendIcon}</span>
                                <span style="font-size: 1.2rem; font-weight: 700; color: ${habit.color}; text-shadow: 0 0 10px ${habit.color}40;">${percentage}%</span>
                            </div>
                            <div style="font-size: 0.6rem; opacity: 0.4; letter-spacing: 1px;">30D INDEX</div>
                        </div>
                    </div>
                    
                    <div class="momentum-graph-container">
                        <svg viewBox="0 0 100 50" preserveAspectRatio="none" class="momentum-svg">
                            <defs>
                                <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="${habit.color}" stop-opacity="0.3" />
                                    <stop offset="100%" stop-color="${habit.color}" stop-opacity="0" />
                                </linearGradient>
                                <filter id="${filterId}">
                                    <feGaussianBlur stdDeviation="1" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>
                            <path d="${areaAttr}" fill="url(#${gradientId})" />
                            <path d="${dAttr}" fill="none" stroke="${habit.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#${filterId})" class="momentum-path" />
                            
                            <!-- Glowing Tip -->
                            <circle cx="${currentPoint.x}" cy="${currentPoint.y}" r="1.5" fill="white" filter="url(#${filterId})">
                                <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                            </circle>
                        </svg>
                        <div class="graph-grid-line" style="top: 20%;"></div>
                        <div class="graph-grid-line" style="top: 80%;"></div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                        <div class="streak-mini">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${habit.color}" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                            <span style="font-size: 0.75rem; font-weight: 600; color: ${habit.color}; opacity: 0.8;">${this.calculateStreak(habit)} Day Streak</span>
                        </div>
                        <button class="btn-liquid-mini" onclick="editHabit(${habit.id})">RECALIBRATE</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    calculateStreak(habit) {
        if (!habit.history) return 0;
        let streak = 0;
        const now = new Date();
        for (let i = 0; i < 365; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            if (habit.history[dateKey]) {
                streak++;
            } else if (i > 0) { // Allow today to be missing if it's still early
                break;
            }
        }
        return streak;
    }

    renderSundaySync() {
        const integrityEl = document.getElementById('system-integrity');
        const streakEl = document.getElementById('best-streak');
        const categoryEl = document.getElementById('top-category');
        const reportEl = document.getElementById('weekly-report-text');
        
        if (!integrityEl) return;

        if (this.habits.length === 0) {
            reportEl.textContent = "No data available. Initiate protocols to begin sync.";
            return;
        }

        // Calculate stats for current week
        const now = new Date();
        const currentDay = now.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        
        let possible = this.habits.length * 7;
        let completed = 0;
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(now);
            d.setDate(now.getDate() + mondayOffset + i);
            const dateKey = d.toISOString().split('T')[0];
            this.habits.forEach(h => {
                if (h.history && h.history[dateKey]) completed++;
            });
        }

        const integrity = Math.round((completed / possible) * 100);
        integrityEl.textContent = `${integrity}%`;
        streakEl.textContent = "7 Days"; // Mock for now
        
        // Find top category
        const catStats = {};
        this.habits.forEach(h => {
            catStats[h.category] = (catStats[h.category] || 0) + 1;
        });
        const topCat = Object.keys(catStats).reduce((a, b) => catStats[a] > catStats[b] ? a : b);
        categoryEl.textContent = topCat;

        reportEl.innerHTML = `
            <div style="line-height: 1.6; opacity: 0.8;">
                Your system integrity is at <strong>${integrity}%</strong> this week. 
                ${integrity > 80 ? "Excellent performance. You are operating at peak efficiency." : "Room for improvement in core protocols."}
                The <strong>${topCat}</strong> category shows the most stability. 
                Recommendation: Focus on consistency during the weekend slump to maintain system momentum.
            </div>
        `;
    }

    renderAnalytics() {
        const heatmap = document.getElementById('consistency-heatmap');
        if(!heatmap) return;
        let dots = '';
        for (let i = 0; i < 154; i++) {
            const intensity = Math.random() > 0.8 ? 'high' : (Math.random() > 0.6 ? 'mid' : '');
            dots += `<div class="heat-dot ${intensity}"></div>`;
        }
        heatmap.innerHTML = dots;

        const streak = document.getElementById('streak-report');
        const weak = document.getElementById('weakness-report');
        if (this.habits.length > 0) {
            streak.textContent = "5 Days Peak";
            weak.textContent = "Weekend Slump";
        } else {
            streak.textContent = "0 Days";
            weak.textContent = "None yet";
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
        localStorage.setItem('theme', this.theme);
        this.persist();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
    }

    async persist() {
        // Always save to localStorage as a fast-loading cache
        localStorage.setItem('localHabits', JSON.stringify(this.habits));
        
        if(this.user) {
            try {
                await setDoc(doc(this.db, "users", this.user.uid), {
                    habits: this.habits,
                    theme: this.theme,
                    lastUpdated: Date.now()
                }, { merge: true });
            } catch (error) {
                console.error("Firestore Error:", error);
            }
        }
    }
}

const tracker = new HabitTracker();
window.tracker = tracker; // Keep global access
