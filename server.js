const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

// Middleware CORS complet
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Content-Length, Authorization');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware de logs détaillés
app.use((req, res, next) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    
    next();
});

// Route RACINE - Essentielle pour les tests
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

// Route HEALTH pour les plateformes de déploiement
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Route STATUS
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        server: 'Zendariom Config Server',
        version: '3.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            used: process.memoryUsage().heapUsed / 1024 / 1024,
            total: process.memoryUsage().heapTotal / 1024 / 1024
        }
    });
});

// Fonction pour calculer le SHA1 d'un fichier
function calculateSHA1(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Fonction pour scanner un dossier récursivement
async function scanDirectory(dir, baseUrl, basePath = '') {
    const results = [];
    
    try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = basePath ? `${basePath}/${item}` : item;
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                // Scanner les sous-dossiers
                const subResults = await scanDirectory(fullPath, baseUrl, relativePath);
                results.push(...subResults);
            } else {
                // Ne traiter que les fichiers pertinents
                if (item.match(/\.(jar|json|txt|cfg|properties|zip|png|jpg|ogg)$/i)) {
                    const fileUrl = `${baseUrl}/files/instances/zendariom/${relativePath.replace(/\\/g, '/')}`;
                    const sha1 = await calculateSHA1(fullPath).catch(() => null);
                    
                    results.push({
                        name: item,
                        path: relativePath.replace(/\\/g, '/'),
                        size: stats.size,
                        url: fileUrl,
                        type: 'file',
                        sha1: sha1,
                        modified: stats.mtime.toISOString()
                    });
                }
            }
        }
    } catch (error) {
        console.error(`Erreur scan ${dir}:`, error.message);
    }
    
    return results;
}

// ROUTE PRINCIPALE pour minecraft-java-core - FORMAT EXACT
app.get('/instances/list', async (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    
    console.log(`📋 Configuration demandée via /instances/list (Format standard)`);
    
    try {
        const instancePath = path.join(__dirname, 'files', 'instances', 'zendariom');
        
        // Vérifier si l'instance existe
        if (!fs.existsSync(instancePath)) {
            console.log(`⚠️ Instance zendariom non trouvée, création...`);
            fs.mkdirSync(instancePath, { recursive: true });
            
            // Créer la structure de base
            ['mods', 'config', 'resourcepacks', 'shaderpacks', 'versions'].forEach(dir => {
                const dirPath = path.join(instancePath, dir);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
            });
        }
        
        // Scanner les fichiers personnalisés
        let customFiles = [];
        try {
            customFiles = await scanDirectory(instancePath, `${protocol}://${host}`);
            console.log(`📁 ${customFiles.length} fichiers personnalisés trouvés`);
        } catch (scanError) {
            console.error('Erreur scan fichiers:', scanError);
        }
        
        // Configuration EXACTE attendue par minecraft-java-core
        const response = [
            {
                name: "zendariom",
                status: "online",
                url: "https://launchermeta.mojang.com", // IMPORTANT: URL Mojang officielle
                whitelistActive: false,
                whitelist: [],
                
                // Configuration du loader
                loadder: {
                    minecraft_version: "1.20.1",
                    loadder_type: "forge",
                    loadder_version: "47.2.0"
                },
                
                // Fichiers personnalisés (mods, configs, etc.)
                files: customFiles,
                
                // Fichiers Minecraft officiels à IGNORER (le launcher les téléchargera depuis Mojang)
                ignored: [
                    "assets/**",
                    "libraries/**",
                    "versions/1.20.1.jar",
                    "versions/1.20.1.json",
                    "versions/1.20.1-forge-47.2.0.json"
                ],
                
                // Métadonnées supplémentaires
                metadata: {
                    description: "Serveur Zendariom",
                    icon: `${protocol}://${host}/icon.png`,
                    background: `${protocol}://${host}/background.jpg`,
                    launcher_compatible: true
                }
            }
        ];
        
        console.log(`✅ Configuration envoyée: ${response[0].files.length} fichiers personnalisés`);
        res.json(response);
        
    } catch (error) {
        console.error('❌ Erreur configuration:', error);
        
        // Réponse d'urgence en cas d'erreur - FORMAT MINIMUM VALIDE
        res.json([
            {
                name: "zendariom",
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
                ignored: [
                    "assets/**",
                    "libraries/**",
                    "versions/**",
                    "*.jar",
                    "*.json"
                ]
            }
        ]);
    }
});

// Route ALTERNATIVE pour compatibilité
app.get('/files/', async (req, res) => {
    const instanceName = req.query.instance || 'zendariom';
    
    console.log(`📋 Configuration demandée via /files/ (Ancien format)`);
    
    // Rediriger vers la nouvelle route
    res.redirect('/instances/list');
});

// Route pour télécharger les fichiers personnalisés
app.get('/files/instances/:instance/*', async (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    const localPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
    
    console.log(`📥 Téléchargement demandé: ${filePath} (Instance: ${instanceName})`);
    
    // Vérifier si c'est un chemin valide
    if (filePath.includes('..')) {
        return res.status(400).json({ error: 'Chemin invalide' });
    }
    
    // Vérifier l'existence du fichier
    if (!fs.existsSync(localPath)) {
        console.log(`❌ Fichier non trouvé: ${filePath}`);
        
        // Si c'est un fichier Minecraft, indiquer qu'il doit être téléchargé depuis Mojang
        if (filePath.includes('assets/') || filePath.includes('libraries/') || filePath.includes('versions/')) {
            return res.status(404).json({
                error: 'Fichier Minecraft officiel',
                message: 'Ce fichier doit être téléchargé depuis les serveurs Mojang officiels',
                path: filePath,
                official_urls: {
                    assets: 'https://resources.download.minecraft.net',
                    libraries: 'https://libraries.minecraft.net',
                    versions: 'https://launcher.mojang.com'
                }
            });
        }
        
        return res.status(404).json({
            error: 'Fichier non trouvé',
            path: filePath,
            local_path: localPath
        });
    }
    
    try {
        const stats = fs.statSync(localPath);
        
        // Vérifier la taille
        if (stats.size === 0) {
            console.log(`⚠️ Fichier vide: ${filePath}`);
            return res.status(500).json({ error: 'Fichier vide' });
        }
        
        console.log(`✅ Fichier trouvé: ${stats.size} bytes, type: ${path.extname(filePath)}`);
        
        // Déterminer le Content-Type
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.jar': 'application/java-archive',
            '.json': 'application/json',
            '.txt': 'text/plain',
            '.cfg': 'text/plain',
            '.properties': 'text/plain',
            '.zip': 'application/zip',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.ogg': 'audio/ogg'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';
        
        // Gérer les requêtes Range (pour les téléchargements partiels)
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            
            if (start >= stats.size || end >= stats.size) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${stats.size}`
                });
                return res.end();
            }
            
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'ETag': `"${stats.size}-${stats.mtime.getTime()}"`
            });
            
            const stream = fs.createReadStream(localPath, { start, end });
            stream.pipe(res);
            
            stream.on('error', (error) => {
                console.error(`Stream error for ${filePath}:`, error);
                res.end();
            });
            
        } else {
            // Téléchargement complet
            res.writeHead(200, {
                'Content-Length': stats.size,
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'ETag': `"${stats.size}-${stats.mtime.getTime()}"`,
                'Last-Modified': stats.mtime.toUTCString()
            });
            
            const stream = fs.createReadStream(localPath);
            stream.pipe(res);
            
            stream.on('error', (error) => {
                console.error(`Stream error for ${filePath}:`, error);
                res.end();
            });
        }
        
    } catch (error) {
        console.error(`❌ Erreur lors du service de ${filePath}:`, error);
        res.status(500).json({
            error: 'Erreur interne',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Route pour uploader des fichiers (optionnel, pour l'administration)
app.post('/upload/:instance/*', express.raw({ limit: '100mb' }), (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    const localPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
    const dirPath = path.dirname(localPath);
    
    // Sécurité
    if (filePath.includes('..')) {
        return res.status(400).json({ error: 'Chemin invalide' });
    }
    
    // Créer le dossier si nécessaire
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Écrire le fichier
    fs.writeFileSync(localPath, req.body);
    
    const stats = fs.statSync(localPath);
    
    res.json({
        success: true,
        path: filePath,
        size: stats.size,
        url: `https://${req.get('host')}/files/instances/${instanceName}/${filePath}`,
        sha1: crypto.createHash('sha1').update(req.body).digest('hex')
    });
});

// Route pour lister les fichiers (admin)
app.get('/list/:instance', (req, res) => {
    const instanceName = req.params.instance;
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    if (!fs.existsSync(instancePath)) {
        return res.json([]);
    }
    
    function listFiles(dir, base = '') {
        const results = [];
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = base ? `${base}/${item}` : item;
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                results.push({
                    name: item,
                    path: relativePath,
                    type: 'directory',
                    size: 0
                });
                
                const subFiles = listFiles(fullPath, relativePath);
                results.push(...subFiles);
            } else {
                results.push({
                    name: item,
                    path: relativePath,
                    type: 'file',
                    size: stats.size,
                    modified: stats.mtime,
                    extension: path.extname(item)
                });
            }
        }
        
        return results;
    }
    
    res.json(listFiles(instancePath));
});

// Route TEST pour vérifier la configuration
app.get('/test/config', (req, res) => {
    res.json({
        test: 'Configuration server',
        timestamp: new Date().toISOString(),
        endpoints: [
            { method: 'GET', path: '/instances/list', description: 'Configuration principale pour le launcher' },
            { method: 'GET', path: '/files/instances/zendariom/*', description: 'Téléchargement de fichiers' },
            { method: 'GET', path: '/status', description: 'État du serveur' },
            { method: 'GET', path: '/health', description: 'Santé du serveur' }
        ],
        expected_by_launcher: {
            route: '/instances/list',
            format: 'JSON array with instance objects',
            required_fields: ['name', 'status', 'url', 'loadder', 'files', 'ignored']
        }
    });
});

// Route pour les erreurs 404
app.use('*', (req, res) => {
    console.log(`❌ Route non trouvée: ${req.method} ${req.originalUrl}`);
    
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.originalUrl,
        method: req.method,
        available_routes: {
            home: 'GET /',
            health: 'GET /health',
            status: 'GET /status',
            instances: 'GET /instances/list',
            download: 'GET /files/instances/zendariom/*',
            test: 'GET /test/config',
            list_files: 'GET /list/zendariom',
            upload: 'POST /upload/zendariom/*'
        },
        timestamp: new Date().toISOString()
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('🔥 Erreur globale:', error);
    
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message,
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// Créer la structure de dossiers au démarrage
function createDirectoryStructure() {
    const baseDirs = [
        'files/instances/zendariom/mods',
        'files/instances/zendariom/config',
        'files/instances/zendariom/resourcepacks',
        'files/instances/zendariom/shaderpacks',
        'files/instances/zendariom/versions',
        'logs'
    ];
    
    baseDirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Dossier créé: ${dir}`);
        }
    });
    
    // Créer un fichier README dans les mods
    const readmePath = path.join(__dirname, 'files', 'instances', 'zendariom', 'mods', 'README.txt');
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, 'Placez vos mods .jar dans ce dossier\nIls seront automatiquement détectés par le launcher.');
    }
    
    // Créer un fichier de configuration exemple
    const configExample = path.join(__dirname, 'files', 'instances', 'zendariom', 'config', 'example-config.txt');
    if (!fs.existsSync(configExample)) {
        fs.writeFileSync(configExample, 'Fichier de configuration exemple\nCe dossier contient les configurations des mods.');
    }
}

// Démarrer le serveur
const server = app.listen(port, () => {
    createDirectoryStructure();
    
    const banner = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                     SERVEUR ZENDARIOM V3.1 - COMPLET                         ║
║                   COMPATIBLE minecraft-java-core 100%                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

📡 Serveur démarré sur: http://localhost:${port}
🌐 URL publique: http://localhost:${port}
🔗 URL configuration: http://localhost:${port}/instances/list
🕐 Heure: ${new Date().toLocaleString()}

🎯 FONCTIONNALITÉS PRINCIPALES:
   ✅ Compatibilité totale avec minecraft-java-core
   ✅ Route /instances/list - FORMAT EXACT attendu
   ✅ Fichiers Minecraft ignorés (téléchargés depuis Mojang)
   ✅ Fichiers personnalisés servis localement
   ✅ Support Range requests (téléchargements partiels)
   ✅ Calcul automatique SHA1
   ✅ Structure de dossiers automatique

🔗 ENDPOINTS DISPONIBLES:
   GET  /                           → Page d'accueil
   GET  /health                     → Vérification santé
   GET  /status                     → État du serveur
   GET  /instances/list            → 🔥 CONFIGURATION POUR LE LAUNCHER
   GET  /files/instances/zendariom/* → Téléchargement fichiers
   GET  /test/config               → Test de configuration
   GET  /list/zendariom            → Liste fichiers (admin)
   POST /upload/zendariom/*        → Upload fichiers (admin)

📁 STRUCTURE DE DOSSIERS:
   • files/instances/zendariom/mods/          → Mods .jar
   • files/instances/zendariom/config/        → Fichiers de configuration
   • files/instances/zendariom/resourcepacks/ → Packs de ressources
   • files/instances/zendariom/shaderpacks/   → Packs de shaders
   • files/instances/zendariom/versions/      → Versions personnalisées

⚠️  IMPORTANT POUR LE LAUNCHER:
   • Le launcher DOIT utiliser: http://localhost:${port}/instances/list
   • Les fichiers Minecraft (assets, libraries) sont IGNORÉS
   • Ils seront téléchargés depuis les serveurs Mojang
   • Votre serveur ne sert QUE les fichiers personnalisés

✅ Prêt à recevoir les requêtes du launcher...
`;
    
    console.log(banner);
});

// Gestion propre de l'arrêt
function gracefulShutdown() {
    console.log('\n🛑 Arrêt propre du serveur...');
    
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
    
    // Forcer l'arrêt après 10 secondes
    setTimeout(() => {
        console.log('⚠️ Arrêt forcé après timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('uncaughtException', (error) => {
    console.error('💥 Exception non capturée:', error);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Rejet de promesse non géré:', reason);
});

// Exporter pour les tests
module.exports = app;
