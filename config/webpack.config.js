const path = require('path');
const package = require('../package.json');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const FileManagerPlugin = require('filemanager-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

function modifyManifest(browser, mode, buffer) {
    // copy-webpack-plugin passes a buffer
    var manifest = JSON.parse(buffer.toString());

    // make any modifications you like, such as
    manifest.version = package.version;

    if (browser === "firefox") {
        manifest.options_ui = {
            page: "pages/options.html"
        };
        manifest.permissions.push("cookies");
        manifest.permissions.push("contextualIdentities");
        manifest.permissions.push("<all_urls>");
        manifest.permissions.push("tabGroups");
        if (mode === "development") {
            manifest.browser_specific_settings = {
                gecko: {
                    id: "surfingkeys-ts@github.com"
                }
            };
        }
    } else if (browser === "safari") {
        manifest.incognito = "split";
        manifest.options_page = "pages/options.html";
        manifest.permissions.push("<all_urls>");
        manifest.background.persistent = false;
    } else {
        // chromium family
        manifest.manifest_version = 3;
        manifest.permissions.push("proxy");
        manifest.permissions.push("tts");
        manifest.permissions.push("downloads.shelf");
        manifest.permissions.push("favicon");
        manifest.permissions.push("userScripts");
        manifest.permissions.push("tabGroups");
        manifest.incognito = "split";
        manifest.options_page = "pages/options.html";
        manifest.background = {
            "service_worker": "background.js"
        };
        manifest.host_permissions = [
            "<all_urls>"
        ];
        manifest.web_accessible_resources = [
            {
                "extension_ids": ["*"],
                "resources": [
                    "_favicon/*",
                    "api.js",
                    "pages/neovim.html",
                    "pages/emoji.tsv",
                    "pages/l10n.json",
                    "pages/frontend.html",
                    "pages/pdf_viewer.html",
                    "pages/pdf_viewer.css",
                    "pages/pdf_viewer.mjs",
                    "pages/shadow.css"
                ],
                "matches": [
                    "<all_urls>"
                ]
            }
        ];
        manifest.action = manifest.browser_action;
        delete manifest.browser_action;
        delete manifest.content_security_policy;
    }

    // pretty print to JSON with two spaces
    manifest_JSON = JSON.stringify(manifest, null, 2);
    return manifest_JSON;
}

module.exports = (env, argv) => {
    const mode = argv.mode;
    const browser = process.env.browser ? process.env.browser : 'chrome';
    let buildPath = path.resolve(__dirname, `../dist/${mode}/`);
    buildPath += "/" + browser;
    const entry = {
        background: `./src/background/${browser}.js`,
        content: `./src/content_scripts/${browser}.js`,
        'pages/frontend': `./src/content_scripts/ui/frontend.js`,
        'pages/start': './src/content_scripts/start.js',
        'pages/ace': './src/content_scripts/ace.js',
    };
    const moduleEntries = {
        'pages/options': './src/content_scripts/options.js',
    };
    const pagesCopyOptions = {
        ignore: [
            '**/images/*',
            '**/neovim.*',
            '**/pdf_viewer.*',
        ]
    };
    const copyPatterns = [
        { from: 'src/pages', to: 'pages', globOptions: pagesCopyOptions },
        { from: 'src/content_scripts/ui/frontend.html', to: 'pages' },
        { from: 'src/content_scripts/ui/frontend.css', to: 'pages' },
        { from: 'node_modules/ace-builds/src-noconflict/worker-javascript.js', to: 'pages' },
        { from: 'src/icons', to: 'icons' },
        { from: 'src/content_scripts/content.css', to: 'content.css' },
        {
            from: "src/manifest.json",
            to:   ".",
            transform (content, path) {
                return modifyManifest(browser, mode, content)
            }
        }
    ];
    // The neovim editor needs its page, its renderer and neovim.html wherever the
    // adapter passes an nvimServer -- which is Chrome and Firefox, but not Safari,
    // whose native host is the app and runs no neovim.
    if (browser === "chrome") {
        pagesCopyOptions.ignore = [];
    } else if (browser === "firefox") {
        pagesCopyOptions.ignore = pagesCopyOptions.ignore.filter((p) => p !== '**/neovim.*');
    }
    if (browser === "chrome" || browser === "firefox") {
        entry['pages/neovim'] = './src/pages/neovim.js';
        moduleEntries['pages/neovim_lib'] = './src/nvim/renderer.ts';
    }
    if (browser === "chrome") {
        moduleEntries['api'] = './src/user_scripts/index.js';
        const chromeOnlyCopyPatterns = [
            { from: 'node_modules/pdfjs-dist/cmaps', to: 'pages/cmaps' },
            { from: 'node_modules/pdfjs-dist/build/pdf.min.mjs', to: 'pages' },
            { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs', to: 'pages' },
        ];
        copyPatterns.push(...chromeOnlyCopyPatterns);
    }

    const module1Plugins = [
        new CopyWebpackPlugin({
            patterns: copyPatterns
        })
    ];
    const module2Plugins = [];

    if (browser !== "safari") {
        entry['pages/markdown'] = './src/content_scripts/markdown.js';
        if (mode === "production") {
            const zipPlugin = new FileManagerPlugin({
                events: {
                    onEnd: {
                        archive: [
                            {
                                source: buildPath,
                                destination: `${buildPath}/sk.zip`
                            },
                        ],
                    },
                },
            });
            module1Plugins.push(zipPlugin);
            module2Plugins.push(zipPlugin);
        }
    } else {
        pagesCopyOptions.ignore.push('**/markdown.html');
        pagesCopyOptions.ignore.push('**/donation.png');
    }
    console.log(pagesCopyOptions);

    const modules = [{
        devtool: false,
        output: {
            path: buildPath,
            filename: '[name].js',
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    loader: 'ts-loader',
                },
                {
                    test: /\.css$/,
                    use: [
                        { loader: "style-loader", options: { injectType: "linkTag" } },
                        { loader: "file-loader" },
                    ]
                },
                {
                    test: /purify.js/,
                    use: [
                        {
                            loader: 'string-replace-loader',
                            options: {
                                search: '//# sourceMappingURL=purify.js.map',
                                replace: ''
                            }
                        }
                    ]
                },
            ],
        },
        target: 'web',
        entry: entry,
        optimization: {
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        },
        plugins: module1Plugins
    }, {
        devtool: false,
        output: {
            path: buildPath,
            filename: '[name].js',
            libraryTarget: 'module',
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        target: 'web',
        entry: moduleEntries,
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    loader: 'ts-loader',
                },
                {
                    test: /\.css$/,
                    use: [
                        { loader: "style-loader", options: { injectType: "linkTag" } },
                        { loader: "file-loader" },
                    ]
                },
            ],
        },
        optimization: {
            minimizer: [new TerserPlugin({
                extractComments: false,
            })],
        },
        plugins: module2Plugins,
        experiments: {
            outputModule: true,
        }
    }];
    return modules;
};
