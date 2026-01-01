const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

// Middleware CORS amélioré
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Content-Length');
    
    // Gérer les requêtes OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware pour logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Fonction pour télécharger un fichier avec retry
async function downloadWithRetry(url, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Tentative ${attempt}/${maxRetries}: ${url}`);
            
            return new Promise((resolve, reject) => {
                const protocol = url.startsWith('https') ? https : http;
                const req = protocol.get(url, { timeout: 10000 }, (response) => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.statusCode}`));
                    }
                });
                
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
            });
            
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                // Attente exponentielle
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    throw lastError;
}

// Route pour la liste des instances - FORMAT ATTENDU PAR LE LAUNCHER
app.get('/instances/list', (req, res) => {
    console.log('📋 Liste des instances demandée');
    
    const instances = [
        {
            name: "zendariom",
            status: "online",
            url: `https://${req.get('host')}`,
            whitelistActive: false,
            whitelist: [],
            
            // CONFIGURATION DE BASE - SANS FICHIERS
            loadder: {
                minecraft_version: "1.20.1",
                loadder_type: "forge",
                loadder_version: "47.2.0"
            },
            
            // Fichiers que le launcher NE doit PAS télécharger depuis ce serveur
            ignored: [
                "assets/**",
                "libraries/**",
                "versions/client/**"
            ],
            
            // Liste VIDE - le launcher utilisera ses propres URLs
            files: []
        }
    ];
    
    console.log(`✅ Liste d'instances envoyée: ${instances.length} instance(s)`);
    res.json(instances);
});

// Route pour servir les fichiers - TOUJOURS proxy vers la source correcte
app.get('/files/instances/:instance/*', async (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    
    console.log(`📥 Demande fichier: ${filePath}`);
    
    // Déterminer la source correcte en fonction du type de fichier
    let sourceUrl = null;
    let filename = path.basename(filePath);
    
    // 1. ASSETS Minecraft (hash SHA1)
    if (filePath.includes('assets/objects/')) {
        // Format: assets/objects/ab/abcdef1234567890abcdef1234567890abcdef12
        const match = filePath.match(/assets\/objects\/([0-9a-f]{2})\/([0-9a-f]{40})/);
        if (match) {
            const prefix = match[1];
            const hash = match[2];
            sourceUrl = `https://resources.download.minecraft.net/${prefix}/${hash}`;
        }
    }
    
    // 2. LIBRAIRIES Minecraft
    else if (filePath.includes('libraries/')) {
        // Format: libraries/com/google/guava/guava/21.0/guava-21.0.jar
        const libPath = filePath.split('libraries/')[1];
        sourceUrl = `https://libraries.minecraft.net/${libPath}`;
    }
    
    // 3. CLIENT Minecraft (jar principal)
    else if (filePath.includes('versions/') && filePath.endsWith('.jar')) {
        // Format: versions/1.20.1/1.20.1.jar
        const version = path.basename(path.dirname(filePath));
        sourceUrl = `https://launcher.mojang.com/v1/objects/client/${version}.jar`;
    }
    
    // 4. FICHIERS PERSONNALISÉS (mods, configs, resourcepacks, etc.)
    else {
        const localPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
        
        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            
            // Vérifier si le fichier n'est pas vide
            if (stats.size > 0) {
                console.log(`✅ Fichier local: ${stats.size} bytes`);
                
                // Gérer les requêtes Range (téléchargements partiels)
                const range = req.headers.range;
                if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
                    const chunksize = (end - start) + 1;
                    
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': 'application/octet-stream'
                    });
                    
                    fs.createReadStream(localPath, { start, end }).pipe(res);
                } else {
                    res.sendFile(localPath);
                }
                return;
            }
        }
        
        // Si on arrive ici, le fichier n'existe pas localement ou est vide
        console.log(`❌ Fichier non trouvé localement: ${filePath}`);
        res.status(404).json({
            error: 'Fichier non trouvé',
            path: filePath,
            suggestion: 'Ce fichier doit être téléchargé depuis les serveurs officiels Minecraft'
        });
        return;
    }
    
    // Si c'est un fichier Minecraft mais aucune URL source n'a été trouvée
    if (!sourceUrl) {
        console.log(`⚠️ Impossible de déterminer la source pour: ${filePath}`);
        res.status(404).json({
            error: 'Source inconnue',
            path: filePath
        });
        return;
    }
    
    console.log(`🌐 Proxy vers: ${sourceUrl}`);
    
    // Proxy vers la source avec retry
    try {
        const response = await downloadWithRetry(sourceUrl, 3);
        
        // Définir les headers
        const headers = {
            'Content-Type': response.headers['content-type'] || 'application/octet-stream',
            'Content-Length': response.headers['content-length']
        };
        
        // Gérer les Range headers si présents dans la réponse
        if (response.headers['accept-ranges']) {
            headers['Accept-Ranges'] = response.headers['accept-ranges'];
        }
        if (response.headers['content-range']) {
            headers['Content-Range'] = response.headers['content-range'];
        }
        
        res.writeHead(response.statusCode, headers);
        
        // Streamer la réponse
        response.pipe(res);
        
        // Log de succès
        response.on('end', () => {
            console.log(`✅ Proxy réussi: ${response.headers['content-length']} bytes`);
        });
        
        // Sauvegarder localement pour cache (uniquement pour les petits fichiers)
        if (parseInt(response.headers['content-length'] || '0') < 10485760) { // 10MB max
            const cacheDir = path.join(__dirname, 'cache', 'instances', instanceName, path.dirname(filePath));
            const cachePath = path.join(cacheDir, filename);
            
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            
            const writeStream = fs.createWriteStream(cachePath);
            response.pipe(writeStream);
            
            writeStream.on('finish', () => {
                console.log(`💾 Cache: ${filename} (${fs.statSync(cachePath).size} bytes)`);
            });
        }
        
    } catch (error) {
        console.error(`❌ Erreur proxy: ${error.message}`);
        
        // Essayer les serveurs de secours pour les fichiers Minecraft
        if (sourceUrl.includes('resources.download.minecraft.net')) {
            const fallbackServers = [
                'https://bmclapi2.bangbang93.com/assets/',
                'https://download.mcbbs.net/assets/'
            ];
            
            for (const server of fallbackServers) {
                try {
                    const fallbackUrl = sourceUrl.replace('https://resources.download.minecraft.net/', server);
                    console.log(`🔄 Essai serveur de secours: ${fallbackUrl}`);
                    
                    const fallbackResponse = await downloadWithRetry(fallbackUrl, 2);
                    
                    res.writeHead(fallbackResponse.statusCode, {
                        'Content-Type': fallbackResponse.headers['content-type'] || 'application/octet-stream',
                        'Content-Length': fallbackResponse.headers['content-length']
                    });
                    
                    fallbackResponse.pipe(res);
                    return;
                    
                } catch (fallbackError) {
                    console.log(`❌ Serveur de secours échoué: ${fallbackError.message}`);
                }
            }
        }
        
        res.status(500).json({
            error: 'Erreur de téléchargement',
            message: error.message,
            source: sourceUrl
        });
    }
});

// Route pour vérifier l'état du serveur
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        server: 'Zendariom File Server',
        version: '2.0',
        features: [
            'Proxy intelligent vers les serveurs Minecraft',
            'Support des téléchargements partiels (Range requests)',
            'Cache local des fichiers',
            'Retry automatique sur échec',
            'Serveurs de secours intégrés'
        ],
        endpoints: {
            instances: `/instances/list`,
            files: `/files/instances/zendariom/*`,
            status: `/status`
        }
    });
});

// Route pour vider le cache
app.get('/clear-cache', (req, res) => {
    const cachePath = path.join(__dirname, 'cache');
    
    if (fs.existsSync(cachePath)) {
        fs.rmSync(cachePath, { recursive: true, force: true });
        console.log('🗑️ Cache vidé');
    }
    
    fs.mkdirSync(cachePath, { recursive: true });
    
    res.json({
        success: true,
        message: 'Cache vidé avec succès'
    });
});

// Route pour précharger les fichiers problématiques
app.get('/preload', async (req, res) => {
    const filesToPreload = [
        // Librairies problématiques
        'libraries/org/slf4j/slf4j-api/2.0.1/slf4j-api-2.0.1.jar',
        'libraries/org/spongepowered/mixin/0.8.5/mixin-0.8.5.jar',
        'libraries/ru/tln4/empty/0.1/empty-0.1.jar',
        
        // Assets essentiels
        'assets/objects/5c/5cca35534cc2ee3529d39b7ccc12b437955e0683',
        'assets/objects/5d/5df4a02b1ebc550514841fddb7d64b9c497d40b4',
        'assets/objects/5c/5cd1caeb2b7c35e58c57a90eed97be8cd893e499'
    ];
    
    const results = [];
    
    for (const file of filesToPreload) {
        try {
            // Construire l'URL
            let url = '';
            if (file.includes('assets/objects/')) {
                const hash = path.basename(file);
                const prefix = hash.substring(0, 2);
                url = `https://resources.download.minecraft.net/${prefix}/${hash}`;
            } else if (file.includes('libraries/')) {
                const libPath = file.split('libraries/')[1];
                url = `https://libraries.minecraft.net/${libPath}`;
            }
            
            // Télécharger
            const response = await downloadWithRetry(url, 2);
            
            // Sauvegarder dans le cache
            const cachePath = path.join(__dirname, 'cache', 'instances', 'zendariom', file);
            const cacheDir = path.dirname(cachePath);
            
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            
            const writeStream = fs.createWriteStream(cachePath);
            response.pipe(writeStream);
            
            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            
            const stats = fs.statSync(cachePath);
            results.push({
                file: path.basename(file),
                status: 'success',
                size: stats.size
            });
            
        } catch (error) {
            results.push({
                file: path.basename(file),
                status: 'failed',
                error: error.message
            });
        }
    }
    
    res.json({
        preloaded: results.length,
        results: results
    });
});

// Route 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.url,
        available_routes: [
            'GET /instances/list',
            'GET /files/instances/:instance/*',
            'GET /status',
            'GET /clear-cache',
            'GET /preload'
        ]
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('🔥 Erreur globale:', error);
    
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                SERVEUR ZENDARIOM V2.0                       ║
╚══════════════════════════════════════════════════════════════╝
📡 Port: ${port}
🌐 URL: http://localhost:${port}

🎯 CARACTÉRISTIQUES:
   ✅ Proxy intelligent vers les serveurs officiels
   🔄 Retry automatique sur échec
   💾 Cache local des fichiers téléchargés
   🛡️ Serveurs de secours intégrés
   📊 Support complet des Range requests

🔗 ROUTES PRINCIPALES:
   /instances/list            → Liste des instances
   /files/instances/:instance/* → Télécharger un fichier
   /status                   → État du serveur
   /clear-cache              → Vider le cache
   /preload                  → Précharger les fichiers critiques

⚠️  IMPORTANT:
   Le serveur ne fournit PAS de liste de fichiers.
   Le launcher doit utiliser ses propres URLs pour les
   fichiers Minecraft (assets, libraries, versions).
   
   Ce serveur sert uniquement de proxy intelligent pour
   les fichiers personnalisés (mods, configs, etc.).

📝 Logs en temps réel dans la console...
`);
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
    console.log('👋 Arrêt propre du serveur...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Arrêt par Ctrl+C...');
    process.exit(0);
});
