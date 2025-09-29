/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["hodek/grnscan/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
