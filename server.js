const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Logs
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Route principale
app.get('/', (req, res) => {
    res.json({
        name: 'Zendariom Config Server',
        status: 'online',
        endpoints: {
            config: '/instances/list',
            health: '/health',
            test: '/test'
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Configuration PRINCIPALE pour le launcher
app.get('/instances/list', (req, res) => {
    console.log('📋 Configuration demandée par le launcher');
    
    const response = [
        {
            name: "zendariom",
            status: "online",
            url: "https://launchermeta.mojang.com", // IMPORTANT: URL Mojang officielle
            whitelistActive: false,
            whitelist: [],
            
            loadder: {
                minecraft_version: "1.20.1",
                loadder_type: "forge",
                loadder_version: "47.2.0"
            },
            
            // Liste des fichiers ESSENTIELS
            files: [
                // Client Minecraft
                {
                    type: "client",
                    folder: "versions/1.20.1/",
                    name: "1.20.1.jar",
                    url: "https://launcher.mojang.com/v1/objects/15c777e2cfe0556eef19aab534d186fd0c5f8c0e/client.jar",
                    path: "versions/1.20.1/1.20.1.jar"
                },
                // Forge installer
                {
                    type: "forge",
                    folder: "versions/",
                    name: "forge-installer.jar",
                    url: "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar",
                    path: "versions/forge-installer.jar"
                },
                // Natives Windows
                {
                    type: "natives",
                    folder: "versions/1.20.1/natives/",
                    name: "natives-windows.jar",
                    url: "https://launcher.mojang.com/v1/objects/866e3ed62047b8e2cdf0d7e0f6b1a7a35f8f3cc5/natives-windows.jar",
                    path: "versions/1.20.1/natives/natives-windows.jar"
                }
            ],
            
            // Fichiers à ignorer
            ignored: []
        }
    ];
    
    console.log(`✅ Configuration envoyée: ${response[0].files.length} fichiers définis`);
    res.json(response);
});

// Route de test
app.get('/test', (req, res) => {
    res.json({
        message: 'Serveur fonctionnel',
        server: 'Render.com',
        url: 'https://config-20dh.onrender.com',
        time: new Date().toISOString()
    });
});

// Route pour fichiers personnalisés (mods, configs)
app.get('/files/instances/:instance/*', (req, res) => {
    const { instance, '0': filePath } = req.params;
    
    console.log(`📥 Demande fichier: ${filePath}`);
    
    // Rediriger les fichiers Minecraft vers Mojang
    if (filePath.includes('assets/') || filePath.includes('libraries/')) {
        return res.status(404).json({
            error: 'Fichier Minecraft',
            message: 'Ce fichier doit être téléchargé depuis les serveurs Mojang',
            redirectToMojang: true
        });
    }
    
    // Pour fichiers personnalisés (à implémenter si nécessaire)
    res.status(404).json({ error: 'Fichier non trouvé' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.originalUrl,
        available: ['/', '/health', '/instances/list', '/test']
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('🔥 Erreur:', err);
    res.status(500).json({ error: 'Erreur interne' });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║      SERVEUR ZENDARIOM - RENDER.COM         ║
║      URL: https://config-20dh.onrender.com  ║
╚══════════════════════════════════════════════╝

📡 Port: ${PORT}
🌐 URL publique: https://config-20dh.onrender.com
✅ Prêt à recevoir les requêtes...
`);
});

// Heartbeat pour Render
setInterval(() => {
    console.log('[HEARTBEAT] Serveur actif');
}, 300000);

module.exports = app;
