export class AnnouncementModal {
    constructor(githubUrl) {
        this.githubUrl = githubUrl;
        this.modalId = 'announcementModal';
        this.storageKey = 'lastAnnouncementShown';
        this.checkInterval = 60 * 60 * 1000;
    }

    async initialize() {
        try {
            console.log('[Announcement] Initialisation du système d\'annonces...');
            console.log('[Announcement] URL GitHub:', this.githubUrl);
            if (!document.getElementById(this.modalId)) {
                console.log('[Announcement] Création du modal dans le DOM');
                this.createModalElement();
            }
            
            // Setup icon click listener
            this.setupIconButton();
            
            await this.checkAndShowAnnouncement();
            console.log('[Announcement] Vérification périodique activée (1 heure)');
            setInterval(() => this.checkAndShowAnnouncement(), this.checkInterval);
        } catch (error) {
            console.error('[Announcement] Erreur initialisation:', error);
        }
    }

    setupIconButton() {
        // Setup banner click
        const banner = document.getElementById('announcementBanner');
        const bannerImg = document.getElementById('announcementBannerImg');
        const closeBtn = document.getElementById('announcementBannerClose');
        
        if (banner && bannerImg) {
            banner.addEventListener('click', async (e) => {
                if (e.target === closeBtn) return;
                console.log('[Announcement] Clic sur la bannière');
                await this.forceShow();
            });
            console.log('[Announcement] Event listener ajouté sur la bannière');
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[Announcement] Fermeture de la bannière');
                banner.style.display = 'none';
            });
        }

        // Observer le changement de thème pour mettre à jour la bannière
        const observer = new MutationObserver(async () => {
            console.log('[Announcement] Changement de thème détecté');
            // Récupérer les dernières données et mettre à jour juste l'image
            const data = await this.fetchAnnouncementData();
            if (data && data.showModal) {
                console.log('[Announcement] Mise à jour de la bannière selon le nouveau thème');
                this.updateIconButton(data);
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-bs-theme']
        });
        console.log('[Announcement] Observer de thème installé');
    }

    createModalElement() {
        const modalHtml = `
            <div class="modal fade" id="${this.modalId}" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div id="announcementBannerContainer" style="display:none; position:relative;">
                            <img id="announcementBannerImage" style="width:100%; height:auto; max-height:300px; object-fit:cover; display:block;" src="" alt="">
                            <button type="button" class="btn-close" data-bs-dismiss="modal" style="position:absolute; top:15px; right:15px; background:rgba(255,255,255,0.9); border-radius:50%; padding:10px;"></button>
                        </div>
                        <div class="modal-header" id="announcementHeader">
                            <h5 class="modal-title" id="announcementTitle"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <h4 id="announcementTitleBody" style="display:none; margin-bottom:15px;"></h4>
                            <div id="announcementMessage"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fermer</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async fetchAnnouncementData() {
        try {
            console.log('[Announcement] Récupération des données depuis GitHub...');
            // Ajouter un timestamp pour éviter le cache
            const url = `${this.githubUrl}?t=${Date.now()}`;
            console.log('[Announcement] URL avec cache-busting:', url);
            const response = await fetch(url, {
                cache: 'no-cache',
                headers: { 'Accept': 'application/json' }
            });
            console.log('[Announcement] Statut HTTP:', response.status);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            // Lire le texte brut d'abord pour debug
            const text = await response.text();
            console.log('[Announcement] 📄 JSON BRUT REÇU:');
            console.log(text);
            
            // Essayer de parser
            const data = JSON.parse(text);
            console.log('[Announcement] 📦 DONNÉES PARSÉES:');
            console.log('  - showModal:', data.showModal);
            console.log('  - id:', data.id);
            console.log('  - title:', data.title);
            console.log('  - bannerUrl:', data.bannerUrl);
            console.log('  - bannerUrlLight:', data.bannerUrlLight);
            console.log('  - bannerUrlDark:', data.bannerUrlDark);
            return data;
        } catch (error) {
            console.error('[Announcement] ❌ ERREUR FETCH:', error.message);
            if (error instanceof SyntaxError) {
                console.error('[Announcement] 🔴 ERREUR DE SYNTAXE JSON - Vérifiez votre fichier sur GitHub !');
                console.error('[Announcement] Détails:', error);
            }
            return null;
        }
    }

    hasAnnouncementBeenShown(announcementData) {
        const lastShown = localStorage.getItem(this.storageKey);
        if (!lastShown) {
            console.log('[Announcement] Aucune annonce précédente dans l\'historique');
            return false;
        }
        try {
            const lastShownData = JSON.parse(lastShown);
            
            // Si l'annonce a un ID, comparer par ID
            if (announcementData.id) {
                const isDuplicate = lastShownData.id === announcementData.id;
                console.log('[Announcement] Vérification doublon par ID:', isDuplicate, '(ID:', announcementData.id, ')');
                return isDuplicate;
            }
            
            // Sinon comparer par titre + message
            const isDuplicate = lastShownData.title === announcementData.title && lastShownData.message === announcementData.message;
            console.log('[Announcement] Vérification doublon par contenu:', isDuplicate);
            return isDuplicate;
        } catch (error) {
            return false;
        }
    }

    markAnnouncementAsShown(announcementData) {
        const data = {
            id: announcementData.id || null,
            title: announcementData.title,
            message: announcementData.message,
            timestamp: Date.now()
        };
        localStorage.setItem(this.storageKey, JSON.stringify(data));
        console.log('[Announcement] Annonce marquée comme affichée:', data);
    }

    async checkAndShowAnnouncement() {
        try {
            console.log('[Announcement] ========== VÉRIFICATION DES ANNONCES ==========');
            const data = await this.fetchAnnouncementData();
            
            if (!data) {
                console.log('[Announcement] ❌ Aucune donnée disponible');
                this.updateIconButton(null);
                return;
            }
            
            console.log('[Announcement] 📋 Données reçues:', {
                id: data.id,
                title: data.title,
                showModal: data.showModal,
                showOnce: data.showOnce
            });
            
            if (!data.showModal) {
                console.log('[Announcement] ❌ Modal désactivé (showModal: false)');
                this.updateIconButton(null);
                return;
            }
            
            // Update icon button
            this.updateIconButton(data);
            
            // Si showOnce est true, vérifier l'historique
            if (data.showOnce === true) {
                const alreadyShown = this.hasAnnouncementBeenShown(data);
                console.log('[Announcement] 🔒 Mode showOnce=true, déjà affiché:', alreadyShown);
                if (alreadyShown) {
                    console.log('[Announcement] ❌ Annonce déjà affichée (showOnce: true), ignorée');
                    return;
                }
                console.log('[Announcement] ✅ Première affichage (showOnce: true)');
            } else {
                console.log('[Announcement] ✅ Mode showOnce=false, affichage multiple autorisé');
            }
            
            console.log('[Announcement] 🎉 AFFICHAGE DU MODAL...');
            this.showModal(data);
            
            // Marquer comme affiché seulement si showOnce est true
            if (data.showOnce === true) {
                this.markAnnouncementAsShown(data);
                // Masquer l'icône et la bannière après affichage
                this.updateIconButton(data);
            }
            console.log('[Announcement] ========== FIN VÉRIFICATION ==========');
        } catch (error) {
            console.error('[Announcement] ❌ ERREUR:', error);
        }
    }

    updateIconButton(data) {
        const banner = document.getElementById('announcementBanner');
        const bannerImg = document.getElementById('announcementBannerImg');

        if (banner && bannerImg) {
            // Déterminer quelle URL utiliser selon le thème
            let bannerUrl = null;
            if (data) {
                const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
                
                if (isDarkMode && data.bannerUrlDark) {
                    bannerUrl = data.bannerUrlDark;
                    console.log('[Announcement] 🌙 Mode sombre, utilisation de bannerUrlDark:', bannerUrl);
                } else if (!isDarkMode && data.bannerUrlLight) {
                    bannerUrl = data.bannerUrlLight;
                    console.log('[Announcement] ☀️ Mode clair, utilisation de bannerUrlLight:', bannerUrl);
                } else if (data.bannerUrl) {
                    // Fallback sur bannerUrl si pas de version spécifique
                    bannerUrl = data.bannerUrl;
                    console.log('[Announcement] 📋 Utilisation de bannerUrl par défaut:', bannerUrl);
                }
            }

            if (bannerUrl) {
                console.log('[Announcement] ✅ Affichage de la bannière');
                bannerImg.src = bannerUrl;
                banner.style.display = 'block';
                
                // Si showOnce est true et déjà affiché, cacher la bannière
                if (data && data.showOnce === true && this.hasAnnouncementBeenShown(data)) {
                    console.log('[Announcement] ❌ Annonce déjà vue, masquage de la bannière');
                    banner.style.display = 'none';
                }
            } else {
                console.log('[Announcement] ❌ Pas de bannière à afficher (aucune URL trouvée)');
                banner.style.display = 'none';
            }
        }
    }

    showModal(data) {
        const modal = document.getElementById(this.modalId);
        if (!modal) {
            console.error('[Announcement] Modal non trouvé dans le DOM');
            return;
        }

        const bannerContainer = modal.querySelector('#announcementBannerContainer');
        const bannerImage = modal.querySelector('#announcementBannerImage');
        const header = modal.querySelector('#announcementHeader');
        const title = modal.querySelector('#announcementTitle');
        const titleBody = modal.querySelector('#announcementTitleBody');
        const message = modal.querySelector('#announcementMessage');

        if (data.image) {
            console.log('[Announcement] Mode avec image:', data.image);
            bannerImage.src = data.image;
            bannerContainer.style.display = 'block';
            header.style.display = 'none';
            titleBody.style.display = 'block';
            titleBody.textContent = data.title || 'Annonce';
            bannerImage.onerror = () => {
                console.error('[Announcement] Erreur chargement image, fallback au header');
                bannerContainer.style.display = 'none';
                header.style.display = 'flex';
                titleBody.style.display = 'none';
                title.textContent = data.title || 'Annonce';
            };
        } else {
            console.log('[Announcement] Mode sans image (header standard)');
            bannerContainer.style.display = 'none';
            header.style.display = 'flex';
            titleBody.style.display = 'none';
            title.textContent = data.title || 'Annonce';
        }

        message.innerHTML = data.message || '';

        console.log('[Announcement] Affichage modal avec titre:', data.title);
        const bsModal = new bootstrap.Modal(modal, { backdrop: 'static', keyboard: true });
        bsModal.show();
    }

    async forceShow() {
        console.log('[Announcement] Force Show demandé');
        const data = await this.fetchAnnouncementData();
        if (data && data.showModal) {
            console.log('[Announcement] Affichage forcé du modal');
            this.showModal(data);
            
            // Marquer comme affiché si showOnce est true
            if (data.showOnce === true) {
                this.markAnnouncementAsShown(data);
                // Masquer l'icône et la bannière après affichage
                this.updateIconButton(data);
            }
        } else {
            console.log('[Announcement] Pas de données à afficher');
        }
    }

    resetHistory() {
        console.log('[Announcement] 🔄 Réinitialisation de l\'historique');
        const oldData = localStorage.getItem(this.storageKey);
        console.log('[Announcement] Anciennes données:', oldData);
        localStorage.removeItem(this.storageKey);
        console.log('[Announcement] ✅ Historique effacé');
    }

    // Fonction de debug
    debugInfo() {
        const stored = localStorage.getItem(this.storageKey);
        console.log('[Announcement] 🔍 DEBUG INFO:');
        console.log('  - Storage Key:', this.storageKey);
        console.log('  - Stored Data:', stored);
        if (stored) {
            try {
                console.log('  - Parsed:', JSON.parse(stored));
            } catch (e) {
                console.log('  - Parse Error:', e);
            }
        }
        console.log('  - GitHub URL:', this.githubUrl);
    }
}

window.AnnouncementModal = AnnouncementModal;

