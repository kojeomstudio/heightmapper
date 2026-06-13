const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const API_KEY = process.env.HEIGHTMAPPER_API_KEY || 'dmlO1fVQRPKI-GrVIYJ1YA';
let mainWindow;

function parseCliArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        headless: false,
        json: false,
        export: false,
        lat: null,
        lng: null,
        zoom: null,
        minElev: 0,
        maxElev: 8848,
        output: null,
        width: 1280,
        height: 720,
        timeout: 60000,
        apiKey: null,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--headless': parsed.headless = true; break;
            case '--json': parsed.json = true; break;
            case '--export': parsed.export = true; break;
            case '--lat': parsed.lat = parseFloat(args[++i]); break;
            case '--lng': parsed.lng = parseFloat(args[++i]); break;
            case '--zoom': parsed.zoom = parseFloat(args[++i]); break;
            case '--min': parsed.minElev = parseFloat(args[++i]); break;
            case '--max': parsed.maxElev = parseFloat(args[++i]); break;
            case '--output': case '-o': parsed.output = args[++i]; break;
            case '--width': parsed.width = parseInt(args[++i]); break;
            case '--height': parsed.height = parseInt(args[++i]); break;
            case '--timeout': parsed.timeout = parseInt(args[++i]); break;
            case '--api-key': parsed.apiKey = args[++i]; break;
        }
    }

    if (parsed.export || parsed.json) {
        parsed.headless = true;
    }

    return parsed;
}

const effectiveApiKey = (cli) => cli.apiKey || API_KEY;

function buildRendererUrl(cli) {
    const params = new URLSearchParams();
    params.set('api_key', effectiveApiKey(cli));
    if (cli.lat !== null) params.set('lat', cli.lat);
    if (cli.lng !== null) params.set('lng', cli.lng);
    if (cli.zoom !== null) params.set('zoom', cli.zoom);
    if (cli.minElev !== 0) params.set('min', cli.minElev);
    if (cli.maxElev !== 8848) params.set('max', cli.maxElev);
    if (cli.headless) params.set('headless', '1');
    if (cli.json) params.set('json', '1');
    if (cli.export) params.set('export', '1');
    if (cli.output) params.set('output', cli.output);

    return `file://${path.join(__dirname, 'index.html')}?${params.toString()}`;
}

function createWindow(cli) {
    const windowOpts = {
        width: cli.width || 1280,
        height: cli.height || 720,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
    };

    if (cli.headless) {
        windowOpts.x = 0;
        windowOpts.y = 0;
        windowOpts.frame = false;
        windowOpts.transparent = true;
        windowOpts.skipTaskbar = true;
    }

    mainWindow = new BrowserWindow(windowOpts);

    const url = buildRendererUrl(cli);
    mainWindow.loadURL(url);

    if (cli.headless) {
        mainWindow.webContents.on('console-message', (_event, level, message) => {
            process.stderr.write(`[renderer] ${message}\n`);
        });
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('headless-config', cli);
        });
    }
}

function setupIpc(cli) {
    ipcMain.handle('save-file', async (_event, { data, filename }) => {
        const buffer = Buffer.from(data, 'base64');
        const outputPath = path.resolve(process.cwd(), filename);
        fs.writeFileSync(outputPath, buffer);
        return outputPath;
    });

    ipcMain.handle('get-cli-args', () => cli);
    ipcMain.handle('get-api-key', () => effectiveApiKey(cli));

    ipcMain.on('render-complete', (_event, metadata) => {
        if (cli.json) {
            const jsonOutput = {
                status: 'ok',
                bounds: metadata.bounds,
                elevation: { min: metadata.minElev, max: metadata.maxElev },
                scaleFactor: metadata.scaleFactor,
                dimensions: { width: metadata.width, height: metadata.height },
                center: { lat: metadata.lat, lng: metadata.lng },
                zoom: metadata.zoom,
            };
            process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
        }

        if (cli.export && metadata.imageData) {
            const buffer = Buffer.from(metadata.imageData, 'base64');
            const outputPath = cli.output || `heightmap-${Date.now()}.png`;
            const resolved = path.resolve(process.cwd(), outputPath);
            fs.writeFileSync(resolved, buffer);
            if (!cli.json) {
                process.stdout.write(`Exported: ${resolved}\n`);
            }
        }

        if (cli.headless) {
            setTimeout(() => app.quit(), 500);
        }
    });

    ipcMain.on('render-error', (_event, errorMsg) => {
        process.stderr.write(`Error: ${errorMsg}\n`);
        app.quit(1);
    });
}

app.whenReady().then(() => {
    const cli = parseCliArgs();
    setupIpc(cli);

    const headlessTimeout = setTimeout(() => {
        if (cli.headless) {
            process.stderr.write('Timeout: rendering did not complete in time\n');
            app.quit(1);
        }
    }, cli.timeout);

    ipcMain.on('render-complete', () => clearTimeout(headlessTimeout));
    ipcMain.on('render-error', () => clearTimeout(headlessTimeout));

    createWindow(cli);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(cli);
        }
    });
});

app.on('window-all-closed', () => {
    app.quit();
});
