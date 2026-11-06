import { _registerLlmProviders } from '../llmProviders.js';
import llmClients from '../llm.js';

export default function registerLlmBridge(bg) {
    const {self, browser, _response, state} = bg;
    const sendTabMessage = (...args) => bg.sendTabMessage(...args);


    /*
     * The LLM providers, read back from storage at every start.
     *
     * They are configured in the user's snippets, which run in a page, so a
     * registration lives only in the memory of this process -- and an MV3 service
     * worker is evicted as soon as it has been idle for a while. The stored copy that
     * `_persistLlmProviderConfig` leaves behind is what survives that, and this reads
     * it back.
     *
     * Everything that answers about providers waits for this read, because the
     * message that WAKES the worker is delivered before it finishes: a chat sent
     * after an idle period would otherwise be answered from an empty registry --
     * "Please set up bedrock correctly" for credentials the user had configured, a
     * custom provider reported as not implemented, or ollama quietly falling back to
     * its built-in default model.
     *
     * Read straight from storage rather than from inside `loadSettings`: that one may
     * fetch the user's snippets over the network first, and waiting on a request that
     * may never finish is not something a chat can afford.
     */
    let llmProvidersRestored = false;
    let waitingForLlmProviders = [];
    /*
     * Whether a page has since told us what the snippets say -- see `updateSettings`,
     * which every page load reaches. What it registers is by definition newer than
     * what is on disk: a read is answered from the state it was ISSUED in, so a get
     * made at boot carries the value from BEFORE the set that same page load
     * persisted. Restoring on top of that would put the previous model or the
     * previous credentials back, and the request that woke this worker -- dispatched
     * as soon as the read lands -- would be the one to use them.
     */
    state.llmProvidersFromSnippets = false;
    /*
     * Releasing the queue is what a waiting request depends on: the frontend books the
     * shared `llmResponse` handler for the duration of one, and a request that never
     * completes silently disables every LLM feature in that frame until a reload. That
     * holds for the failing read too, hence the `catch` below -- a chrome API throws
     * synchronously once the extension context has been invalidated, and a request
     * answered from an empty registry at least says something.
     *
     * There is deliberately no timer behind it. A read that is accepted and then never
     * answered means this worker was suspended, and a timer would have been suspended
     * with it; the storage callback is the only thing that can report on a read.
     */
    function llmProvidersReady() {
        llmProvidersRestored = true;
        const waiting = waitingForLlmProviders;
        waitingForLlmProviders = [];
        waiting.forEach((cb) => cb());
    }
    function whenLlmProvidersReady(cb) {
        if (llmProvidersRestored) {
            cb();
        } else {
            waitingForLlmProviders.push(cb);
        }
    }
    try {
        chrome.storage.local.get({ _llmProviderConfig: {} }, function(stored) {
            // `stored` is undefined when the read failed rather than came back empty
            // (chrome.runtime.lastError is set for the length of this callback); the
            // point is to reach llmProvidersReady() either way, since a throw in here
            // leaves whatever is queued waiting forever
            if (!state.llmProvidersFromSnippets) {
                _registerLlmProviders(stored && stored._llmProviderConfig);
            }
            llmProvidersReady();
        });
    } catch (e) {
        llmProvidersReady();
    }
    function toUTF8(str) {
        try {
            return decodeURIComponent(escape(str));
        } catch {
            return str;
        }
    }
    /*
     * The reply destination is captured per request, here in this closure, and must
     * stay that way: it cannot be hoisted into one variable that later requests
     * overwrite.
     *
     * Requests overlap. Several frames' content scripts wake this worker at once and
     * queue behind the provider read (see whenLlmProvidersReady), a provider streams
     * for as long as the model takes to answer, and nothing stops the user asking in
     * a second tab meanwhile. Read the destination at delivery time instead of
     * capturing it and it holds whoever asked LAST, so every earlier request's chunks
     * and its completion go to that frame: one tab's answer appears inside another,
     * and the frame that actually asked waits forever on a reply that was delivered
     * elsewhere -- which keeps its `llmResponse` booking and disables every LLM
     * feature there until a reload.
     */
    const llmClientOf = (sender) => ({
        tabId: sender.tab.id,
        frameId: sender.frameId,
        origin: sender.origin.toLowerCase(),
    });
    const sendLLMessage = (client, message) => {
        if (browser.name === "Safari" && chrome.runtime.getURL("/").toLowerCase().indexOf(client.origin) === 0) {
              chrome.runtime.sendMessage(message);
        } else {
            sendTabMessage(client.tabId, client.frameId, message);
        }
    };

    /*
     * The request in flight for each frame, so that `llmAbort` can cancel it.
     *
     * Keyed by frame because a frame only ever has one: every caller books the shared
     * `llmResponse` handler for the duration of a request, and there is nothing in a
     * reply to tell two of them apart anyway. The record still carries the request's
     * OWN name, since a frame's requests come one after another and an abort must not
     * be allowed to land on the wrong one -- see `llmAbort`.
     */
    const llmInFlight = {};
    const llmFrameKey = (client) => `${client.tabId}:${client.frameId}`;

    self.llmRequest = function (message, sender, sendResponse) {
        const client = llmClientOf(sender);
        const frame = llmFrameKey(client);

        /*
         * This request's own record, held in the closure for the same reason the
         * reply destination is: what it says must be about THIS request and not
         * about whichever one is newest by the time it is read.
         *
         * `cancelled` is what makes an abort silent. Cancelling a fetch does not
         * stop it reporting -- the rejection reaches `fail`, which sends a chunk and
         * a completion -- and by then the frame may have asked something new and
         * booked `llmResponse` again, so those two would land in the answer to the
         * NEW question and release its booking early. Nothing about the reply says
         * which request it belongs to, so the abandoned request is silenced here,
         * where that is still known.
         */
        const inFlight = { id: message.requestId, abort: null, cancelled: false };
        llmInFlight[frame] = inFlight;


        const send = (msg) => {
            if (inFlight.cancelled) {
                return;
            }
            sendLLMessage(client, msg);
        };
        // the frame is free again, unless a newer request has since claimed the slot
        const finished = () => {
            if (llmInFlight[frame] === inFlight) {
                delete llmInFlight[frame];
            }
        };

        const provider = message.provider;
        // the request may be what woke this worker, in which case the providers the
        // previous one held have not been read back yet -- see whenLlmProvidersReady
        whenLlmProvidersReady(function() {
            if (inFlight.cancelled) {
                // stopped while queued behind the provider read: there is nothing to
                // abort yet, so not starting it is the abort
                return;
            }
            if (llmClients.hasOwnProperty(provider)) {
                const llmClient = llmClients[provider];
                inFlight.abort = llmClient(message, {
                    onComplete: (message) => {
                        if (message.content && message.content.constructor.name === "Array") {
                            message.content = message.content.map((c) => {
                                return c.type === "text" ? { type: "text", text: toUTF8(c.text) } : c;
                            });
                        }
                        finished();
                        send({
                            subject: 'llmResponse',
                            message,
                            done: true
                        });
                    },
                    onChunk: (chunk) => {
                        send({
                            subject: 'llmResponse',
                            chunk: toUTF8(chunk)
                        });
                    },
                });
                if (inFlight.cancelled && inFlight.abort) {
                    // the abort arrived while the provider was starting up, before
                    // there was anything to call it on
                    inFlight.abort();
                }
            } else {
                /*
                 * The same two messages a provider sends, never one carrying both:
                 * every caller reads `chunk` and `done` as alternatives, so a message
                 * with both is delivered as a chunk and its completion is never seen
                 * -- which leaves the caller's `llmResponse` booking held forever and
                 * silently disables every LLM feature in that frame until a reload.
                 */
                finished();
                send({
                    subject: 'llmResponse',
                    chunk: `**Warning:** There is no LLM provider ${provider} implemented.`
                });
                send({
                    subject: 'llmResponse',
                    message: {},
                    done: true
                });
            }
        });
    };
    /**
     * Cancel the request this frame has in flight, for a user who stopped a chat
     * mid-answer (llmchat.js `stopTurn`).
     *
     * The point is the connection, not the bookkeeping: while it is open the model
     * goes on generating and the user goes on paying for tokens nobody will read.
     * Nothing is sent back, and nothing more from that request reaches the frame --
     * see `cancelled` above -- so the frame is free to ask again immediately.
     *
     * `requestId` says WHICH request is being abandoned, and one that names a request
     * this frame is no longer running does nothing. That silence is the whole reason
     * to check: cancelling makes a request stop reporting, so cancelling the wrong
     * one leaves the frame waiting for an answer that will never come, holding the
     * shared booking, with every LLM feature in it dead until a reload. A caller that
     * sends no name still cancels whatever is in flight, which is all a caller with
     * one request at a time can mean.
     *
     * A frame with nothing in flight is not an error either: an abort races a reply
     * that was already on its way, and the caller cannot know which won.
     */
    self.llmAbort = function (message, sender, sendResponse) {
        const frame = llmFrameKey(llmClientOf(sender));
        const inFlight = llmInFlight[frame];
        if (!inFlight) {
            return;
        }
        if (message.requestId !== undefined && inFlight.id !== message.requestId) {
            return;
        }
        delete llmInFlight[frame];
        inFlight.cancelled = true;
        if (inFlight.abort) {
            inFlight.abort();
        }
    };
    self.getAllLlmProviders = function (message, sender, sendResponse) {
        // the same wait: a woken worker would otherwise report only the built-in
        // providers, leaving the user's own out of the list they pick from
        whenLlmProvidersReady(function() {
            _response(message, sendResponse, {
                providers: Object.keys(llmClients).filter(p => p !== 'custom')
            });
        });
    };
}
