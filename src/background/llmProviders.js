import llmClients from './llm.js';

function _registerLlmProviders(llmConf) {
    if (!llmConf) {
        return;
    }
    if (llmConf.ollama && llmConf.ollama.model) {
        llmClients.ollama.model = llmConf.ollama.model;
    }
    if (llmConf.bedrock
        && llmConf.bedrock.accessKeyId
        && llmConf.bedrock.secretAccessKey
        && llmConf.bedrock.model) {
        llmClients.bedrock.init(llmConf.bedrock);
    }
    if (llmConf.custom) {
        const reservedNames = ['bedrock', 'ollama', 'custom'];
        for (const name in llmConf.custom) {
            if (llmConf.custom.hasOwnProperty(name) && llmConf.custom[name].serviceUrl) {
                if (reservedNames.indexOf(name) !== -1) {
                    console.warn(`[Surfingkeys] "${name}" is a built-in LLM provider, skipped as a custom provider.`);
                    continue;
                }
                llmClients.custom.register(name, llmConf.custom[name]);
                llmClients[name] = llmClients.custom;
            }
        }
    }
}

/*
 * Store what the snippets carry, and report whether they carried anything at all --
 * the caller uses that to decide whether this is now the newest word on the
 * providers, see `llmProvidersFromSnippets`.
 */
function _persistLlmProviderConfig(llmConf) {
    const persistable = { custom: llmConf.custom || {} };
    if (llmConf.ollama && llmConf.ollama.model) {
        persistable.ollama = { model: llmConf.ollama.model };
    }
    if (llmConf.bedrock
        && llmConf.bedrock.accessKeyId
        && llmConf.bedrock.secretAccessKey
        && llmConf.bedrock.model) {
        // credentials live in the user's snippets (also stored in chrome.storage),
        // so persist them too; the bedrock client cannot be re-initialised after a
        // background restart without them.
        persistable.bedrock = llmConf.bedrock;
    }
    // an empty or missing llm config means the snippets carried no providers,
    // so leave whatever was stored alone.
    if (llmConf.custom === undefined
        && !(llmConf.ollama && llmConf.ollama.model)
        && !persistable.bedrock) {
        return false;
    }
    chrome.storage.local.set({ _llmProviderConfig: persistable });
    return true;
}

export { _persistLlmProviderConfig, _registerLlmProviders };
