Zotero.Connector = new function() {
	this.callMethod = Zotero.Promise.method(function(options, data, cb, tab) {
		console.log("JabRef: Tried to contact Zotero standalone: " + options);
		throw new Error("Zotero Offline");
	});

	this.callMethodWithCookies = function(options, data, tab) {
		if (options === "saveItems") {
			browser.storage.sync.get(['exportMode', 'takeSnapshots', 'retrieveCitationCounts'])
				.then(configuration => {
					console.debug("exportMode: " + configuration.exportMode);
					console.debug("takeSnapshots: " + configuration.takeSnapshots);
					console.debug("retrieveCitationCounts: " + configuration.retrieveCitationCounts);
					if (configuration.retrieveCitationCounts) {
						// create zsc compatible items
						for (let i = 0; i < data.items.length; i++) {
							data.items[i] = new ZscItem(data.items[i]);
						}

						// get citations counts for all items
						zsc.processItems(data.items);
					}

					this.convertToBibTex(data.items)
						.then((bibtex) => this.sendBibTexToJabRef(bibtex));
				});
		} else {
			console.log("Tried to contact Zotero standalone: " + options);
			throw new Error("Zotero Offline");
		}
	};

	this.checkIsOnline = Zotero.Promise.method(function() {
		var deferred = Zotero.Promise.defer();
		// Pretend that we are connected to Zotero standalone
		deferred.resolve(true);
		return deferred.promise;
	});

	this.prepareForExport = function(items) {
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			for (var j = 0; j < item.attachments.length; j++) {
				var attachment = item.attachments[j];

				// Pretend we downloaded the file since otherwise it is not exported
				if (attachment.url) {
					attachment.localPath = attachment.url;
				}
			}
		}
	};

	this.convertToBibTex = function(items) {
		this.prepareForExport(items);

		browser.runtime.sendMessage({
			"onConvertToBibtex": "convertStarted"
		});

		return browser.tabs.query({
			currentWindow: true,
			active: true
		}).then(tabs => {
			for (let tab of tabs) {
				return browser.tabs.sendMessage(
					tab.id, {
						convertToBibTex: items
					}
				);
			}
		})
	};

	this.sendBibTexToJabRef = function(bibtex) {
		browser.runtime.sendMessage({
			"onSendToJabRef": "sendToJabRefStarted"
		});
		console.log("JabRef: Send BibTeX to JabRef: %o", bibtex);

		browser.runtime.sendNativeMessage("org.jabref.jabref", {
				"text": bibtex
			})
			.then(response => {
				console.log("JabRef: Got response from JabRef: %o with details %o", response.message, response.output);
				if (response.message == 'ok') {
					browser.runtime.sendMessage({
						"popupClose": "close"
					});
				}
			}, error => {
				console.error("JabRef: Error connecting to JabRef: %o", error);
				browser.runtime.sendMessage({
					"errorWhileSendingToJabRef": error.message
				});
			});
	}
};
