const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

// Middleware CORS complet
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Route RACINE - Page d'accueil
app.get('/', (req, res) => {
    res.json({
        name: 'Zendariom Configuration Server',
        version: '3.0',
        status: 'online',
        endpoints: {
            instances: 'GET /instances/list',
            instances_alt: 'GET /files/?instance=zendariom',
            file_download: 'GET /files/instances/zendariom/*',
            status: 'GET /status',
            health: 'GET /health'
        },
        documentation: 'Ce serveur fournit la configuration pour le launcher Zendariom. Compatible minecraft-java-core'
    });
});

// Route STATUS
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        server: 'Zendariom Config Server',
        version: '3.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Route HEALTH
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Route INSTANCES/LIST - Compatible avec minecraft-java-core
app.get('/instances/list', (req, res) => {
    console.log('📋 Configuration demandée via /instances/list');
    
    res.json([
        {
            name: "zendariom",
            status: "online",
            url: "https://launchermeta.mojang.com",
            whitelistActive: false,
            whitelist: [],
            
            // Configuration du loader
            loadder: {
                minecraft_version: "1.20.1",
                loadder_type: "forge",
                loadder_version: "47.2.0"
            },
            
            // Fichiers personnalisés (à adapter selon vos besoins)
            files: [],
            
            // Fichiers à ignorer (le launcher les télécharge depuis Mojang)
            ignored: [
                "assets/**",
                "libraries/**",
                "versions/1.20.1.jar",
                "versions/1.20.1.json"
            ],
            
            // Métadonnées optionnelles
            metadata: {
                description: "Serveur Zendariom",
                icon: "https://config-20dh.onrender.com/icon.png",
                background: "https://config-20dh.onrender.com/background.jpg"
            }
        }
    ]);
});

// Route alternative pour les fichiers
app.get('/files/', (req, res) => {
    const instanceName = req.query.instance || 'zendariom';
    console.log(`📋 Configuration alternative pour: ${instanceName}`);
    
    // Réponse similaire à /instances/list pour compatibilité
    res.json([
        {
            name: instanceName,
            status: "online",
            url: "https://launchermeta.mojang.com",
            whitelistActive: false,
            whitelist: [],
            loadder: {
                minecraft_version: "1.20.1",
                loadder_type: "forge",
                loadder_version: "47.2.0"
            },
            files: [],
            ignored: ["assets/**", "libraries/**"]
        }
    ]);
});

// Route pour télécharger les fichiers
app.get('/files/instances/:instance/*', (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    
    console.log(`📥 Demande fichier: ${filePath} pour ${instanceName}`);
    
    // Ici, vous pouvez ajouter la logique pour servir des fichiers personnalisés
    // Pour l'instant, on retourne un message d'information
    res.json({
        info: "Endpoint de téléchargement de fichiers",
        instance: instanceName,
        file: filePath,
        note: "Cette route sert les fichiers personnalisés (mods, configs, etc.)"
    });
});

// Route 404 pour les autres requêtes
app.use((req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.url,
        available_routes: [
            'GET /',
            'GET /instances/list',
            'GET /files/?instance=zendariom',
            'GET /files/instances/zendariom/*',
            'GET /status',
            'GET /health'
        ]
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('Erreur:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message
    });
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║     SERVEUR ZENDARIOM V3.0 - EN LIGNE            ║
╚═══════════════════════════════════════════════════╝
📡 Port: ${port}
🌐 URL: https://config-20dh.onrender.com
✅ Prêt à recevoir les requêtes du launcher
`);
});

// Exporter pour les tests
module.exports = app;
