const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS complet
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware de logs
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - ${req.headers['user-agent']?.substring(0, 50) || 'No-Agent'}`);
    next();
});

// Route principale
app.get('/', (req, res) => {
    res.json({
        server: 'Zendariom Configuration Server',
        version: '3.0',
        status: 'online',
        url: 'https://config-20dh.onrender.com',
        endpoints: {
            config: 'GET /instances/list',
            health: 'GET /health',
            test: 'GET /test',
            ping: 'GET /ping'
        },
        note: 'Ce serveur fournit la configuration pour le launcher Zendariom'
    });
});

// Health check pour Render
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Ping simple
app.get('/ping', (req, res) => {
    res.json({ pong: Date.now() });
});

// Route de test
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Serveur fonctionnel',
        time: new Date().toISOString(),
        data: {
            sample: 'Ceci est une réponse JSON de test',
            array: [1, 2, 3],
            object: { key: 'value' }
        }
    });
});

// Route PRINCIPALE - Configuration pour minecraft-java-core
app.get('/instances/list', (req, res) => {
    console.log('📋 Configuration demandée par minecraft-java-core');
    
    try {
        // CORRECTION IMPORTANTE : Utiliser l'URL CORRECTE qui retourne du JSON
        const response = [
            {
                name: "zendariom",
                status: "online",
                // URL CORRIGÉE : celle qui fonctionne avec minecraft-java-core
                url: "https://piston-meta.mojang.com", // CORRECTION : piston-meta au lieu de launchermeta
                
                whitelistActive: false,
                whitelist: [],
                
                // Configuration Minecraft
                loadder: {
                    minecraft_version: "1.20.1",
                    loadder_type: "forge",
                    loadder_version: "47.2.0"
                },
                
                // CORRECTION : Fournir une liste de fichiers ESSENTIELLE
                // minecraft-java-core NE PEUT PAS fonctionner avec files: []
                files: [
                    // Fichier client Minecraft 1.20.1
                    {
                        type: "client",
                        folder: "versions/1.20.1/",
                        name: "1.20.1.jar",
                        url: "https://piston-data.mojang.com/v1/objects/15c777e2cfe0556eef19aab534d186fd0c5f8c0e/client.jar",
                        path: "versions/1.20.1/1.20.1.jar",
                        sha1: "15c777e2cfe0556eef19aab534d186fd0c5f8c0e"
                    },
                    // Fichier manifest de version
                    {
                        type: "version",
                        folder: "versions/1.20.1/",
                        name: "1.20.1.json",
                        url: "https://piston-meta.mojang.com/v1/packages/15c777e2cfe0556eef19aab534d186fd0c5f8c0e/1.20.1.json",
                        path: "versions/1.20.1/1.20.1.json"
                    },
                    // Forge installer
                    {
                        type: "forge",
                        folder: "versions/",
                        name: "forge-installer.jar",
                        url: "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-installer.jar",
                        path: "versions/forge-installer.jar"
                    }
                ],
                
                // Fichiers à ignorer
                ignored: [],
                
                // Métadonnées supplémentaires
                metadata: {
                    description: "Serveur Zendariom - Minecraft 1.20.1 avec Forge",
                    created: new Date().toISOString(),
                    maintainer: "Zendariom Team"
                }
            }
        ];
        
        console.log(`✅ Configuration envoyée: ${response[0].files.length} fichiers définis`);
        
        // Forcer le Content-Type JSON
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(response);
        
    } catch (error) {
        console.error('❌ Erreur génération configuration:', error);
        
        // Réponse d'urgence en JSON
        res.status(500).json({
            error: 'Erreur interne',
            message: error.message,
            fallback: true,
            instances: [
                {
                    name: "zendariom",
                    status: "online",
                    url: "https://piston-meta.mojang.com",
                    loadder: {
                        minecraft_version: "1.20.1",
                        loadder_type: "forge",
                        loadder_version: "47.2.0"
                    },
                    files: [],
                    ignored: []
                }
            ]
        });
    }
});

// Route alternative - format minimal
app.get('/files/', (req, res) => {
    // Rediriger vers la route principale
    res.redirect('/instances/list');
});

// Route pour les fichiers personnalisés (mods, configs, etc.)
app.get('/files/instances/:instance/*', (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    
    console.log(`📥 Demande fichier personnalisé: ${filePath}`);
    
    // Si c'est un fichier Minecraft, rediriger vers les serveurs corrects
    if (filePath.includes('assets/') || filePath.includes('libraries/')) {
        return res.status(404).json({
            error: 'Fichier Minecraft officiel',
            message: 'Ce fichier doit être téléchargé depuis les serveurs Mojang',
            redirect_to: 'https://piston-data.mojang.com'
        });
    }
    
    // Pour fichiers personnalisés
    const safePath = filePath.replace(/\.\./g, '').replace(/\/\//g, '/');
    const localPath = path.join(__dirname, 'files', instanceName, safePath);
    
    if (fs.existsSync(localPath)) {
        try {
            const stats = fs.statSync(localPath);
            
            // Vérifier que ce n'est pas un dossier
            if (stats.isDirectory()) {
                return res.status(400).json({ error: 'Est un dossier, pas un fichier' });
            }
            
            // Déterminer le Content-Type
            const ext = path.extname(filePath).toLowerCase();
            const contentTypes = {
                '.jar': 'application/java-archive',
                '.json': 'application/json',
                '.txt': 'text/plain',
                '.zip': 'application/zip',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.properties': 'text/plain'
            };
            
            const contentType = contentTypes[ext] || 'application/octet-stream';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            const stream = fs.createReadStream(localPath);
            stream.pipe(res);
            
            stream.on('error', (error) => {
                console.error(`Stream error: ${error.message}`);
                res.status(500).json({ error: 'Erreur lecture fichier' });
            });
            
        } catch (error) {
            console.error(`❌ Erreur lecture: ${error.message}`);
            res.status(500).json({ error: 'Erreur lecture fichier' });
        }
    } else {
        console.log(`❌ Fichier non trouvé: ${filePath}`);
        res.status(404).json({
            error: 'Fichier non trouvé',
            path: filePath,
            suggestion: 'Placez le fichier dans le dossier files/zendariom/'
        });
    }
});

// Route pour vérifier la santé des serveurs Mojang
app.get('/check-mojang', async (req, res) => {
    console.log('🔍 Vérification serveurs Mojang...');
    
    const servers = [
        { name: 'piston-meta', url: 'https://piston-meta.mojang.com' },
        { name: 'launchermeta', url: 'https://launchermeta.mojang.com' },
        { name: 'piston-data', url: 'https://piston-data.mojang.com' },
        { name: 'resources', url: 'https://resources.download.minecraft.net' },
        { name: 'libraries', url: 'https://libraries.minecraft.net' }
    ];
    
    const results = [];
    
    for (const server of servers) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(server.url, {
                method: 'HEAD',
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));
            
            results.push({
                name: server.name,
                url: server.url,
                status: response.status,
                statusText: response.statusText,
                contentType: response.headers.get('content-type'),
                online: response.ok
            });
            
        } catch (error) {
            results.push({
                name: server.name,
                url: server.url,
                error: error.message,
                online: false
            });
        }
    }
    
    res.json({
        timestamp: new Date().toISOString(),
        servers: results,
        recommendation: results.find(s => s.name === 'piston-meta')?.online 
            ? 'Utiliser piston-meta.mojang.com' 
            : 'Problème avec les serveurs Mojang'
    });
});

// Route pour créer un fichier de test
app.get('/create-test-file', (req, res) => {
    const testDir = path.join(__dirname, 'files', 'zendariom', 'test');
    const testFile = path.join(testDir, 'test.txt');
    
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    fs.writeFileSync(testFile, 'Ceci est un fichier de test créé par le serveur Zendariom\n' + 
        'Timestamp: ' + new Date().toISOString() + '\n' +
        'URL: https://config-20dh.onrender.com\n');
    
    res.json({
        success: true,
        message: 'Fichier de test créé',
        path: '/files/instances/zendariom/test/test.txt',
        url: 'https://config-20dh.onrender.com/files/instances/zendariom/test/test.txt',
        size: fs.statSync(testFile).size
    });
});

// Route 404 avec suggestions
app.use('*', (req, res) => {
    console.log(`❌ Route non trouvée: ${req.originalUrl}`);
    
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.originalUrl,
        method: req.method,
        suggestions: [
            'GET / - Page d\'accueil',
            'GET /health - Vérification santé',
            'GET /instances/list - CONFIGURATION POUR LE LAUNCHER',
            'GET /test - Test serveur',
            'GET /check-mojang - Vérifier serveurs Mojang'
        ],
        documentation: 'https://config-20dh.onrender.com'
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('🔥 Erreur globale:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });
    
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Veuillez réessayer plus tard',
        timestamp: new Date().toISOString(),
        requestId: Date.now().toString(36) + Math.random().toString(36).substr(2)
    });
});

// Créer la structure de dossiers au démarrage
function initializeStructure() {
    const baseDir = path.join(__dirname, 'files', 'zendariom');
    const subDirs = [
        'mods',
        'config',
        'resourcepacks',
        'shaderpacks',
        'saves',
        'logs',
        'test'
    ];
    
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
        console.log(`📁 Dossier base créé: ${baseDir}`);
    }
    
    subDirs.forEach(dir => {
        const dirPath = path.join(baseDir, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Sous-dossier créé: ${dir}`);
        }
    });
    
    // Créer un fichier README
    const readmePath = path.join(baseDir, 'README.txt');
    if (!fs.existsSync(readmePath)) {
        const readmeContent = `# Serveur Zendariom

Ce dossier contient les fichiers de configuration pour le launcher Zendariom.

## Structure:
- mods/ : Vos mods Minecraft (.jar)
- config/ : Fichiers de configuration
- resourcepacks/ : Packs de ressources
- shaderpacks/ : Packs de shaders
- saves/ : Sauvegardes de monde
- logs/ : Journaux

## Serveur:
- URL: https://config-20dh.onrender.com
- Dernière mise à jour: ${new Date().toISOString()}
`;
        fs.writeFileSync(readmePath, readmeContent);
    }
}

// Démarrer le serveur
const server = app.listen(PORT, () => {
    initializeStructure();
    
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                SERVEUR ZENDARIOM V3.0 - FIX                     ║
║               CORRECTION ERREUR XML/JSON                        ║
╚══════════════════════════════════════════════════════════════════╝

📡 Port: ${PORT}
🌐 URL publique: https://config-20dh.onrender.com
🕐 Démarrage: ${new Date().toLocaleString()}
📍 Environnement: ${process.env.NODE_ENV || 'development'}

✅ CORRECTIONS APPLIQUÉES:
   • URL corrigée: piston-meta.mojang.com (au lieu de launchermeta)
   • Liste de fichiers fournie (obligatoire pour minecraft-java-core)
   • Content-Type forcé en JSON
   • URLs des fichiers corrigées

🎯 ENDPOINTS PRINCIPAUX:
   • GET /                 → Page d'accueil
   • GET /health          → Vérification santé (pour Render)
   • GET /instances/list  → CONFIGURATION POUR LE LAUNCHER ⭐
   • GET /test           → Test serveur
   • GET /check-mojang   → Vérifier serveurs Mojang

⚙️  CONFIGURATION ENVOYÉE:
   • Minecraft: 1.20.1
   • Forge: 47.2.0
   • URL serveur: https://piston-meta.mojang.com
   • Fichiers définis: 3
   • Format: JSON strict

🔧 POUR LE LAUNCHER:
   • Le launcher utilisera piston-meta.mojang.com
   • Les fichiers sont définis dans la réponse
   • Format JSON garanti

✅ Serveur prêt à recevoir les requêtes...
`);
});

// Heartbeat pour Render (éviter le sommeil)
setInterval(() => {
    console.log(`[HEARTBEAT] ${new Date().toLocaleTimeString()} - Serveur actif`);
}, 300000); // 5 minutes

// Gestion propre de l'arrêt
function gracefulShutdown() {
    console.log('\n🛑 Arrêt propre du serveur...');
    
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
    
    setTimeout(() => {
        console.log('⚠️ Arrêt forcé après timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('💥 Exception non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Rejet de promesse non géré:', reason);
});

// Exporter pour les tests
module.exports = app;
