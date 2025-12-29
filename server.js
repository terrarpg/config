const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// MIDDLEWARE CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware pour parser les JSON
app.use(express.json());

// Middleware pour servir les fichiers statiques
app.use('/files', express.static(path.join(__dirname, 'files')));

// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Terra File Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #333; }
                .status { color: green; font-weight: bold; }
                .url { background: #f5f5f5; padding: 10px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>✅ Terra File Server - Opérationnel</h1>
            <p class="status">Format corrigé pour Minecraft Launcher</p>
            <p>URL de l'API : <code class="url">${req.protocol}://${req.get('host')}/files?instance=zendariom</code></p>
            <p><strong>⚠️ IMPORTANT : Retourne un tableau JSON directement (pas d'objet wrapper)</strong></p>
        </body>
        </html>
    `);
});

// Route PRINCIPALE - Scan COMPLET de l'instance (FORMAT CORRIGÉ)
app.get('/files/', (req, res) => {
    const instanceName = req.query.instance;
    
    if (!instanceName) {
        return res.status(400).json([]); // Retourne un tableau vide
    }
    
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    console.log(`📂 Scan instance pour Minecraft: "${instanceName}"`);
    
    try {
        if (!fs.existsSync(instancePath)) {
            console.log(`❌ Instance non trouvée`);
            return res.json([]); // Retourne un tableau vide
        }

        // Fonction pour scanner RÉCURSIVEMENT tous les fichiers
        function scanAllFiles(dir, basePath = '') {
            let allFiles = [];
            
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const relativePath = path.join(basePath, item).replace(/\\/g, '/');
                    
                    try {
                        const stats = fs.statSync(fullPath);
                        
                        if (stats.isDirectory()) {
                            // Scanner récursivement le sous-dossier
                            const subFiles = scanAllFiles(fullPath, relativePath);
                            allFiles = allFiles.concat(subFiles);
                        } else {
                            // CRITIQUE : URL ABSOLUE avec le domaine Render
                            const protocol = req.protocol;
                            const host = req.get('host');
                            const fullUrl = `${protocol}://${host}/files/instances/${instanceName}/${relativePath}`;
                            
                            // FORMAT ATTENDU PAR MINECRAFT-JAVA-CORE :
                            // Objet simple avec les propriétés requises
                            allFiles.push({
                                name: item,
                                path: relativePath,
                                size: stats.size,
                                url: fullUrl, // URL COMPLÈTE ABSOLUE
                                type: 'file',
                                modified: stats.mtime.toISOString()
                                // Note: 'hash' est optionnel, la librairie utilisera 'name' si absent
                            });
                        }
                    } catch (error) {
                        console.log(`⚠️ Erreur sur ${fullPath}:`, error.message);
                    }
                }
            } catch (error) {
                console.log(`⚠️ Erreur lecture dossier ${dir}:`, error.message);
            }
            
            return allFiles;
        }

        // Scanner TOUS les fichiers de l'instance
        const allFiles = scanAllFiles(instancePath);
        
        console.log(`✅ ${allFiles.length} fichiers trouvés - Format: tableau direct`);
        
        // CRITIQUE : Retourner DIRECTEMENT le tableau (pas d'objet wrapper)
        // C'est ce que minecraft-java-core attend
        res.json(allFiles);
        
    } catch (error) {
        console.error('❌ Erreur scan:', error);
        res.status(500).json([]); // Retourne un tableau vide en cas d'erreur
    }
});

// Route alternative avec format complet (pour debug)
app.get('/files-full/', (req, res) => {
    const instanceName = req.query.instance;
    
    if (!instanceName) {
        return res.status(400).json({ error: 'Instance manquante' });
    }
    
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    console.log(`📊 Scan format complet: "${instanceName}"`);
    
    try {
        if (!fs.existsSync(instancePath)) {
            return res.json({ success: false, error: 'Instance non trouvée' });
        }

        function scanAllFiles(dir, basePath = '') {
            let allFiles = [];
            
            try {
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const relativePath = path.join(basePath, item).replace(/\\/g, '/');
                    
                    try {
                        const stats = fs.statSync(fullPath);
                        
                        if (stats.isDirectory()) {
                            const subFiles = scanAllFiles(fullPath, relativePath);
                            allFiles = allFiles.concat(subFiles);
                        } else {
                            const protocol = req.protocol;
                            const host = req.get('host');
                            const fullUrl = `${protocol}://${host}/files/instances/${instanceName}/${relativePath}`;
                            
                            allFiles.push({
                                name: item,
                                path: relativePath,
                                size: stats.size,
                                url: fullUrl,
                                type: 'file',
                                modified: stats.mtime.toISOString()
                            });
                        }
                    } catch (error) {
                        console.log(`⚠️ Erreur sur ${fullPath}:`, error.message);
                    }
                }
            } catch (error) {
                console.log(`⚠️ Erreur lecture dossier ${dir}:`, error.message);
            }
            
            return allFiles;
        }

        const allFiles = scanAllFiles(instancePath);
        
        // Format complet avec métadonnées
        res.json({
            success: true,
            instance: instanceName,
            server: `${req.protocol}://${req.get('host')}`,
            timestamp: new Date().toISOString(),
            totalFiles: allFiles.length,
            totalSize: allFiles.reduce((sum, file) => sum + file.size, 0),
            files: allFiles
        });
        
    } catch (error) {
        console.error('❌ Erreur scan:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour télécharger n'importe quel fichier
app.get('/files/instances/:instance/*', (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    
    const fullPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
    
    console.log(`📤 Demande fichier: ${filePath}`);
    
    try {
        if (!fs.existsSync(fullPath)) {
            console.log(`❌ Fichier non trouvé: ${fullPath}`);
            return res.status(404).json({ 
                error: 'Fichier non trouvé',
                path: filePath
            });
        }
        
        const stats = fs.statSync(fullPath);
        const fileSize = stats.size;
        
        // Gérer les requêtes avec Range (pour les téléchargements partiels)
        const range = req.headers.range;
        
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            if (start >= fileSize || end >= fileSize) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                });
                return res.end();
            }
            
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(fullPath, { start, end });
            
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'application/octet-stream',
            };
            
            res.writeHead(206, head);
            file.pipe(res);
            
        } else {
            // Téléchargement complet
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'application/octet-stream';
            
            if (ext === '.json') contentType = 'application/json';
            else if (ext === '.jar') contentType = 'application/java-archive';
            else if (ext === '.txt' || ext === '.log' || ext === '.cfg') contentType = 'text/plain';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
            };
            
            res.writeHead(200, head);
            fs.createReadStream(fullPath).pipe(res);
        }
        
    } catch (error) {
        console.error('❌ Erreur envoi fichier:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: error.message
        });
    }
});

// Route pour lister les instances disponibles
app.get('/instances', (req, res) => {
    const instancesPath = path.join(__dirname, 'files', 'instances');
    
    try {
        if (!fs.existsSync(instancesPath)) {
            fs.mkdirSync(instancesPath, { recursive: true });
            return res.json([]);
        }
        
        const instances = fs.readdirSync(instancesPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        console.log(`📋 Instances disponibles: ${instances.join(', ')}`);
        
        res.json(instances);
        
    } catch (error) {
        console.error('❌ Erreur lecture instances:', error);
        res.status(500).json({ error: 'Erreur lecture instances' });
    }
});

// Route pour vérifier la santé du serveur
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: `${req.protocol}://${req.get('host')}`,
        format: 'minecraft-ready (tableau direct)'
    });
});

// Route de test pour vérifier le format
app.get('/test-format', (req, res) => {
    // Exemple de ce que doit retourner /files?instance=zendariom
    const exampleFormat = [
        {
            "name": "5.json",
            "path": "assets/indexes/5.json",
            "size": 412473,
            "url": "https://config-20dh.onrender.com/files/instances/zendariom/assets/indexes/5.json",
            "type": "file",
            "modified": "2025-12-29T16:37:42.000Z"
        },
        {
            "name": "000c82756fd54e40cb236199f2b479629d0aca2f",
            "path": "assets/objects/00/000c82756fd54e40cb236199f2b479629d0aca2f",
            "size": 8565,
            "url": "https://config-20dh.onrender.com/files/instances/zendariom/assets/objects/00/000c82756fd54e40cb236199f2b479629d0aca2f",
            "type": "file",
            "modified": "2025-12-29T16:37:42.000Z"
        }
    ];
    
    res.json({
        message: "Format attendu par minecraft-java-core",
        important: "Doit être un TABLEAU ([]) pas un OBJET ({})",
        example: exampleFormat,
        test_url: `${req.protocol}://${req.get('host')}/files?instance=zendariom`
    });
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        availableRoutes: [
            'GET /files?instance=NOM',
            'GET /files-full?instance=NOM (format debug)',
            'GET /instances',
            'GET /health',
            'GET /test-format'
        ]
    });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
    console.error('🔥 Erreur globale:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message
    });
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`\n===========================================`);
    console.log(`🚀 Terra File Server DÉMARRÉ`);
    console.log(`===========================================`);
    console.log(`📡 Port: ${port}`);
    console.log(`🌐 URL Render: https://votre-app.onrender.com`);
    console.log(`📁 Dossier instances: ${path.join(__dirname, 'files', 'instances')}`);
    console.log(`🎮 Format: TABLEAU direct (compatible minecraft-java-core)`);
    console.log(`\n🔗 Routes principales:`);
    console.log(`   → /files?instance=zendariom`);
    console.log(`   → /files/instances/zendariom/* (téléchargement)`);
    console.log(`   → /health (vérification)`);
    console.log(`\n⚠️  IMPORTANT: /files retourne un TABLEAU []`);
    console.log(`===========================================\n`);
    
    // Vérifier les instances
    const instancesPath = path.join(__dirname, 'files', 'instances');
    if (fs.existsSync(instancesPath)) {
        try {
            const instances = fs.readdirSync(instancesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            if (instances.length > 0) {
                console.log(`📋 Instances trouvées (${instances.length}):`);
                instances.forEach(instance => {
                    console.log(`   → ${instance}`);
                    console.log(`     URL: http://localhost:${port}/files?instance=${instance}`);
                });
            } else {
                console.log(`📭 Aucune instance trouvée`);
                console.log(`💡 Créez: mkdir -p files/instances/zendariom`);
            }
        } catch (error) {
            console.log(`⚠️ Erreur lecture instances: ${error.message}`);
        }
    } else {
        console.log(`📁 Création dossier instances...`);
        fs.mkdirSync(instancesPath, { recursive: true });
        console.log(`✅ Dossier créé: ${instancesPath}`);
    }
    
    console.log(`\n✅ Serveur prêt pour le launcher Minecraft\n`);
});
