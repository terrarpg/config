const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000; // IMPORTANT: Render fournit PORT

// MIDDLEWARE CORS (CRITIQUE pour le launcher Electron)
app.use((req, res, next) => {
    // Autoriser toutes les origines
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    
    // Gérer les requêtes pré-flight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware pour parser les JSON
app.use(express.json());

// Middleware pour servir les fichiers statiques
app.use('/files', express.static(path.join(__dirname, 'files'), {
    setHeaders: (res, filePath) => {
        // Définir les headers pour les téléchargements
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.json') {
            res.setHeader('Content-Type', 'application/json');
        } else if (ext === '.jar') {
            res.setHeader('Content-Type', 'application/java-archive');
        } else if (ext === '.txt' || ext === '.log' || ext === '.cfg') {
            res.setHeader('Content-Type', 'text/plain');
        } else if (ext === '.png') {
            res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
            res.setHeader('Content-Type', 'image/jpeg');
        } else {
            res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        // Autoriser les requêtes avec Range (téléchargements partiels)
        res.setHeader('Accept-Ranges', 'bytes');
    }
}));

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
            <p class="status">Serveur fonctionnel - Prêt pour le launcher Terra</p>
            <p>URL de l'API : <code class="url">${req.protocol}://${req.get('host')}/files?instance=zendariom</code></p>
            <p>Port : <strong>${port}</strong></p>
            <p>Dossier instances : <code>${path.join(__dirname, 'files', 'instances')}</code></p>
        </body>
        </html>
    `);
});

// Route PRINCIPALE - Scan COMPLET de l'instance (MODIFIÉE)
app.get('/files/', (req, res) => {
    const instanceName = req.query.instance;
    
    if (!instanceName) {
        return res.status(400).json({
            error: 'Paramètre "instance" manquant',
            usage: '/files?instance=NOM_INSTANCE'
        });
    }
    
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    console.log(`📂 Scan complet de l'instance: "${instanceName}"`);
    console.log(`📁 Chemin: ${instancePath}`);
    
    try {
        if (!fs.existsSync(instancePath)) {
            console.log(`❌ Instance non trouvée: ${instancePath}`);
            return res.status(404).json({
                error: 'Instance non trouvée',
                instance: instanceName,
                suggestion: 'Vérifiez le nom de l\'instance'
            });
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
                            // CORRECTION CRITIQUE : URL ABSOLUE avec le domaine Render
                            const protocol = req.protocol;
                            const host = req.get('host');
                            const fullUrl = `${protocol}://${host}/files/instances/${instanceName}/${relativePath}`;
                            
                            // Déterminer le type de fichier
                            const ext = path.extname(item).toLowerCase();
                            let fileType = 'file';
                            if (ext === '.jar') fileType = 'library';
                            else if (ext === '.json') fileType = 'config';
                            else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') fileType = 'image';
                            
                            allFiles.push({
                                name: item,
                                path: relativePath,
                                size: stats.size,
                                url: fullUrl, // URL COMPLÈTE ABSOLUE
                                type: fileType,
                                modified: stats.mtime.toISOString(),
                                hash: this.generateFileHash ? this.generateFileHash(fullPath) : null
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
        
        console.log(`✅ Total fichiers trouvés: ${allFiles.length}`);
        
        // Ajouter des informations de résumé
        const summary = {
            instance: instanceName,
            totalFiles: allFiles.length,
            totalSize: allFiles.reduce((sum, file) => sum + file.size, 0),
            byType: allFiles.reduce((acc, file) => {
                acc[file.type] = (acc[file.type] || 0) + 1;
                return acc;
            }, {}),
            folders: this.getTopLevelFolders ? this.getTopLevelFolders(instancePath) : []
        };
        
        console.log(`📊 Résumé: ${JSON.stringify(summary, null, 2)}`);
        
        // Retourner avec métadonnées
        res.json({
            success: true,
            instance: instanceName,
            server: `${req.protocol}://${req.get('host')}`,
            timestamp: new Date().toISOString(),
            summary: summary,
            files: allFiles
        });
        
    } catch (error) {
        console.error('❌ Erreur scan complet:', error);
        res.status(500).json({ 
            error: 'Erreur scan instance',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Route optimisée pour télécharger n'importe quel fichier (MODIFIÉE)
app.get('/files/instances/:instance/*', (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    
    const fullPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
    
    console.log(`📤 Demande fichier: ${filePath}`);
    console.log(`📁 Chemin complet: ${fullPath}`);
    
    try {
        if (!fs.existsSync(fullPath)) {
            console.log(`❌ Fichier non trouvé: ${fullPath}`);
            return res.status(404).json({ 
                error: 'Fichier non trouvé',
                path: filePath,
                instance: instanceName
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
                'Cache-Control': 'public, max-age=31536000'
            };
            
            res.writeHead(206, head);
            file.pipe(res);
            
            console.log(`📦 Envoi partiel: ${start}-${end}/${fileSize} (${chunksize} bytes)`);
            
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
                'Cache-Control': 'public, max-age=31536000',
                'ETag': `"${stats.mtime.getTime()}"`
            };
            
            res.writeHead(200, head);
            fs.createReadStream(fullPath).pipe(res);
            
            console.log(`📦 Envoi complet: ${fileSize} bytes (${contentType})`);
        }
        
    } catch (error) {
        console.error('❌ Erreur envoi fichier:', error);
        res.status(500).json({ 
            error: 'Erreur serveur',
            message: error.message,
            path: filePath
        });
    }
});

// Route pour lister les instances disponibles
app.get('/instances', (req, res) => {
    const instancesPath = path.join(__dirname, 'files', 'instances');
    
    try {
        if (!fs.existsSync(instancesPath)) {
            fs.mkdirSync(instancesPath, { recursive: true });
            console.log(`📁 Dossier instances créé: ${instancesPath}`);
            return res.json({ 
                instances: [],
                message: 'Dossier instances créé',
                path: instancesPath
            });
        }
        
        const instances = fs.readdirSync(instancesPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => ({
                name: dirent.name,
                path: `/files/instances/${dirent.name}`,
                url: `${req.protocol}://${req.get('host')}/files?instance=${dirent.name}`
            }));
        
        console.log(`📋 Instances disponibles: ${instances.map(i => i.name).join(', ')}`);
        
        res.json({
            success: true,
            server: `${req.protocol}://${req.get('host')}`,
            total: instances.length,
            instances: instances
        });
        
    } catch (error) {
        console.error('❌ Erreur lecture instances:', error);
        res.status(500).json({ 
            error: 'Erreur lecture instances',
            message: error.message
        });
    }
});

// Route pour vérifier la santé du serveur
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: `${req.protocol}://${req.get('host')}`,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        instancesPath: path.join(__dirname, 'files', 'instances')
    });
});

// Route pour obtenir les infos d'une instance spécifique
app.get('/instance/:name/info', (req, res) => {
    const instanceName = req.params.name;
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    try {
        if (!fs.existsSync(instancePath)) {
            return res.status(404).json({
                error: 'Instance non trouvée',
                name: instanceName
            });
        }
        
        const stats = fs.statSync(instancePath);
        const folders = fs.readdirSync(instancePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        res.json({
            name: instanceName,
            path: instancePath,
            created: stats.birthtime,
            modified: stats.mtime,
            folders: folders,
            url: `${req.protocol}://${req.get('host')}/files?instance=${instanceName}`
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Erreur lecture instance',
            message: error.message
        });
    }
});

// NOUVELLE ROUTE: Proxy pour téléchargements externes
app.get('/proxy/download', async (req, res) => {
    try {
        const { url, filename } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'Paramètre "url" manquant' });
        }
        
        console.log(`🌐 Proxy download: ${url}`);
        
        // Utiliser le bon module selon le protocole
        const httpModule = url.startsWith('https://') ? require('https') : require('http');
        
        httpModule.get(url, (response) => {
            if (response.statusCode !== 200) {
                console.log(`❌ Proxy erreur: ${response.statusCode} pour ${url}`);
                return res.status(response.statusCode).json({ 
                    error: `Erreur ${response.statusCode}`,
                    url: url
                });
            }
            
            // Définir les headers
            const headers = { ...response.headers };
            
            if (filename) {
                headers['Content-Disposition'] = `attachment; filename="${filename}"`;
            }
            
            // Supprimer certains headers problématiques
            delete headers['content-encoding'];
            
            res.writeHead(response.statusCode, headers);
            
            // Streamer la réponse
            response.pipe(res);
            
            console.log(`✅ Proxy réussi: ${url}`);
            
        }).on('error', (error) => {
            console.error('❌ Erreur proxy:', error);
            res.status(500).json({ 
                error: 'Erreur proxy',
                message: error.message,
                url: url
            });
        });
        
    } catch (error) {
        console.error('❌ Erreur proxy:', error);
        res.status(500).json({ 
            error: 'Erreur proxy',
            message: error.message
        });
    }
});

// NOUVELLE ROUTE: Téléchargement direct avec vérification
app.get('/download/:instance/:file(*)', (req, res) => {
    const { instance, file } = req.params;
    const fullPath = path.join(__dirname, 'files', 'instances', instance, file);
    
    if (fs.existsSync(fullPath)) {
        res.download(fullPath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        path: req.path,
        method: req.method,
        availableRoutes: [
            'GET /',
            'GET /files?instance=NOM',
            'GET /instances',
            'GET /health',
            'GET /instance/:name/info',
            'GET /proxy/download?url=URL',
            'GET /download/:instance/:file'
        ]
    });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
    console.error('🔥 Erreur globale:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Contactez l\'administrateur',
        timestamp: new Date().toISOString()
    });
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`\n===========================================`);
    console.log(`🚀 Terra File Server DÉMARRÉ`);
    console.log(`===========================================`);
    console.log(`📡 URL: http://localhost:${port}`);
    console.log(`🌐 Pour Render: https://votre-app.onrender.com`);
    console.log(`📁 Dossier instances: ${path.join(__dirname, 'files', 'instances')}`);
    console.log(`🕐 Heure: ${new Date().toLocaleString()}`);
    console.log(`===========================================\n`);
    
    // Afficher les instances disponibles au démarrage
    const instancesPath = path.join(__dirname, 'files', 'instances');
    if (fs.existsSync(instancesPath)) {
        try {
            const instances = fs.readdirSync(instancesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            if (instances.length > 0) {
                console.log(`📋 Instances disponibles (${instances.length}):`);
                instances.forEach(instance => {
                    console.log(`   → ${instance}`);
                });
            } else {
                console.log(`📭 Aucune instance trouvée`);
                console.log(`💡 Créez un dossier dans: ${instancesPath}`);
            }
        } catch (error) {
            console.log(`⚠️ Erreur lecture instances: ${error.message}`);
        }
    } else {
        console.log(`📁 Création du dossier instances...`);
        fs.mkdirSync(instancesPath, { recursive: true });
        console.log(`✅ Dossier créé: ${instancesPath}`);
    }
    
    console.log(`\n✅ Serveur prêt. Attente de connexions...\n`);
});

// Fonctions utilitaires
function getTopLevelFolders(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    } catch (error) {
        return [];
    }
}

function generateFileHash(filePath) {
    // Simple hash basé sur la taille et la date de modification
    try {
        const stats = fs.statSync(filePath);
        return `${stats.size}_${stats.mtime.getTime()}`;
    } catch (error) {
        return null;
    }
}

// Attacher les fonctions utilitaires à l'objet
app.getTopLevelFolders = getTopLevelFolders;
app.generateFileHash = generateFileHash;

module.exports = app;
