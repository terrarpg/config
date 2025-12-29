const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Route PRINCIPALE - DOIT RETOURNER UN TABLEAU DIRECTEMENT
app.get('/files/', (req, res) => {
    const instanceName = req.query.instance;
    
    if (!instanceName) {
        // IMPORTANT: Retourner un tableau vide, pas un objet
        return res.status(400).json([]);
    }
    
    const instancePath = path.join(__dirname, 'files', 'instances', instanceName);
    
    console.log(`🔍 Scan instance: ${instanceName}`);
    
    // Vérifier si l'instance existe
    if (!fs.existsSync(instancePath)) {
        console.log(`❌ Instance non trouvée: ${instancePath}`);
        // IMPORTANT: Retourner un tableau vide, pas un objet
        return res.json([]);
    }

    // Fonction récursive pour scanner les fichiers
    function scanDirectory(dir, basePath = '') {
        const results = [];
        
        try {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const relativePath = basePath ? `${basePath}/${item}` : item;
                
                try {
                    const stats = fs.statSync(fullPath);
                    
                    if (stats.isDirectory()) {
                        // Scanner récursivement les sous-dossiers
                        const subItems = scanDirectory(fullPath, relativePath);
                        results.push(...subItems);
                    } else {
                        // CRÉER L'OBJET AU FORMAT EXACT ATTENDU
                        const fileObject = {
                            name: item, // Nom du fichier
                            path: relativePath.replace(/\\/g, '/'), // Chemin relatif
                            size: stats.size, // Taille en bytes
                            // URL ABSOLUE complète
                            url: `https://${req.get('host')}/files/instances/${instanceName}/${relativePath.replace(/\\/g, '/')}`,
                            type: 'file', // Toujours 'file'
                            modified: stats.mtime.toISOString() // Date ISO
                        };
                        
                        results.push(fileObject);
                    }
                } catch (error) {
                    console.log(`⚠️ Ignoré ${fullPath}:`, error.message);
                }
            }
        } catch (error) {
            console.log(`⚠️ Erreur scan ${dir}:`, error.message);
        }
        
        return results;
    }

    try {
        // Scanner tous les fichiers
        const files = scanDirectory(instancePath);
        
        console.log(`✅ ${files.length} fichiers trouvés pour ${instanceName}`);
        
        // CRITIQUE : Retourner DIRECTEMENT le tableau, pas d'objet wrapper
        res.json(files);
        
    } catch (error) {
        console.error('❌ Erreur:', error);
        // En cas d'erreur, retourner un tableau vide
        res.status(500).json([]);
    }
});

// Route pour servir les fichiers
app.get('/files/instances/:instance/*', (req, res) => {
    const instanceName = req.params.instance;
    const filePath = req.params[0];
    const fullPath = path.join(__dirname, 'files', 'instances', instanceName, filePath);
    
    console.log(`📤 Servir: ${filePath}`);
    
    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else {
        res.status(404).json({ error: 'Fichier non trouvé' });
    }
});

// Route simple pour vérifier que le serveur fonctionne
app.get('/', (req, res) => {
    res.json({
        message: 'Serveur Minecraft Files',
        format: 'Retourne un tableau [] directement (compatible minecraft-java-core)',
        example: [
            {
                name: "5.json",
                path: "assets/indexes/5.json",
                size: 412473,
                url: `https://${req.get('host')}/files/instances/zendariom/assets/indexes/5.json`,
                type: "file",
                modified: "2025-12-29T16:37:42.000Z"
            }
        ],
        usage: `GET /files?instance=zendariom`
    });
});

// Route pour tester le format
app.get('/test', (req, res) => {
    // Exemple de ce que DOIT retourner /files?instance=zendariom
    const example = [
        {
            name: "5.json",
            path: "assets/indexes/5.json",
            size: 412473,
            url: `https://${req.get('host')}/files/instances/zendariom/assets/indexes/5.json`,
            type: "file",
            modified: "2025-12-29T16:37:42.000Z"
        },
        {
            name: "000c82756fd54e40cb236199f2b479629d0aca2f",
            path: "assets/objects/00/000c82756fd54e40cb236199f2b479629d0aca2f",
            size: 8565,
            url: `https://${req.get('host')}/files/instances/zendariom/assets/objects/00/000c82756fd54e40cb236199f2b479629d0aca2f`,
            type: "file",
            modified: "2025-12-29T16:37:42.000Z"
        }
    ];
    
    res.json(example);
});

// Démarrer le serveur
app.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║      SERVEUR MINECRAFT FILES - FORMAT CORRECT     ║
╚═══════════════════════════════════════════════════╝
📡 Port: ${port}
🌐 URL: http://localhost:${port}
🎯 Format: TABLEAU [] (pas d'objet wrapper)

🔗 TESTS IMPORTANTS:
  1. http://localhost:${port}/test
     → Doit afficher un tableau avec 2 fichiers exemple
  
  2. http://localhost:${port}/files?instance=zendariom
     → Doit afficher un tableau avec vos fichiers
     → EXEMPLE: [
         {
           "name": "5.json",
           "path": "assets/indexes/5.json",
           "size": 412473,
           "url": "http://localhost:${port}/files/instances/zendariom/assets/indexes/5.json",
           "type": "file",
           "modified": "..."
         }
       ]

⚠️  ATTENTION: Pas de {success: true, files: [...]}
✅  CORRECT: Directement [...]

✅ Serveur prêt pour minecraft-java-core
`);
});
