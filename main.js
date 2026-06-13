const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--headless': parsed.headless = true; break;
            case '--json': parsed.json = true; break;
            case '--export': parsed.export = true; break;
            case '--lat': if (i + 1 < args.length) parsed.lat = parseFloat(args[++i]); break;
            case '--lng': if (i + 1 < args.length) parsed.lng = parseFloat(args[++i]); break;
            case '--zoom': if (i + 1 < args.length) parsed.zoom = parseFloat(args[++i]); break;
            case '--min': if (i + 1 < args.length) parsed.minElev = parseFloat(args[++i]); break;
            case '--max': if (i + 1 < args.length) parsed.maxElev = parseFloat(args[++i]); break;
            case '--output': case '-o': if (i + 1 < args.length) parsed.output = args[++i]; break;
            case '--width': if (i + 1 < args.length) parsed.width = parseInt(args[++i]); break;
            case '--height': if (i + 1 < args.length) parsed.height = parseInt(args[++i]); break;
            case '--timeout': if (i + 1 < args.length) parsed.timeout = parseInt(args[++i]); break;
        }
    }

    if (parsed.export || parsed.json) {
        parsed.headless = true;
    }

    return parsed;
}

function buildRendererUrl(cli) {
    const params = new URLSearchParams();
    if (cli.lat !== null) params.set('lat', cli.lat);
    if (cli.lng !== null) params.set('lng', cli.lng);
    if (cli.zoom !== null) params.set('zoom', cli.zoom);
    if (cli.minElev !== 0) params.set('min', cli.minElev);
    if (cli.maxElev !== 8848) params.set('max', cli.maxElev);
    if (cli.headless) params.set('headless', '1');
    if (cli.json) params.set('json', '1');
    if (cli.export) params.set('export', '1');
    if (cli.output) params.set('output', cli.output);

    const indexPath = path.join(__dirname, 'index.html');
    const fileUrl = new URL('file:///');
    fileUrl.pathname = indexPath.replace(/\\/g, '/');
    fileUrl.search = params.toString();
    return fileUrl.toString();
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
            if (level >= 2) {
                process.stderr.write(`[renderer] ${message}\n`);
            }
        });
    }
}

function setupIpc(cli) {
    ipcMain.handle('save-file', async (_event, { data, filename }) => {
        try {
            const buffer = Buffer.from(data, 'base64');
            const sanitized = path.basename(filename || 'heightmap.png');
            const outputPath = path.resolve(process.cwd(), sanitized);
            fs.writeFileSync(outputPath, buffer);
            return outputPath;
        } catch (e) {
            throw new Error(`Failed to save file: ${e.message}`);
        }
    });

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
            const sanitized = path.basename(cli.output || `heightmap-${Date.now()}.png`);
            const resolved = path.resolve(process.cwd(), sanitized);
            fs.writeFileSync(resolved, buffer);
            if (!cli.json) {
                process.stdout.write(`Exported: ${resolved}\n`);
            }
        }

        if (cli.headless) {
            setTimeout(() => app.exit(0), 500);
        }
    });

    ipcMain.on('render-error', (_event, errorMsg) => {
        process.stderr.write(`Error: ${errorMsg}\n`);
        app.exit(1);
    });
}

app.whenReady().then(() => {
    const cli = parseCliArgs();
    setupIpc(cli);

    const headlessTimeout = setTimeout(() => {
        if (cli.headless) {
            process.stderr.write('Timeout: rendering did not complete in time\n');
            app.exit(1);
        }
    }, cli.timeout);

    ipcMain.on('render-complete', () => clearTimeout(headlessTimeout));
    ipcMain.on('render-error', () => clearTimeout(headlessTimeout));

    createWindow(cli);

    if (!cli.headless) {
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow(cli);
            }
        });
    }
});

app.on('window-all-closed', () => {
    app.quit();
});
