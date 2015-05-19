/**************************************************
 * Check state of wearables, reauth if necessary
 **************************************************/

// Modules
var common = require("./common.js");
var bluetooth = require("./bluetooth.js");
var socket = require("./socket.js");

setInterval(function(){

	console.log("Current users: " + JSON.stringify(bluetooth.activePeripherals));
	console.log("Needs checking: " + JSON.stringify(bluetooth.needsCheckingQueue));

	if(!common.useMockData) {

		// Check each of the active peripherals
		for (var peripheralKey in bluetooth.activePeripherals) {

			var activePeripheral = bluetooth.activePeripherals[peripheralKey];

			// If we last saw the peripheral over 20s ago, but less than a minute
			if (activePeripheral.lastConnectionTime < (common.currentDate() - 20) &&
				activePeripheral.lastConnectionTime > (common.currentDate() - 60)) {

				// Is it already in the needsChecking queue?
				for (var i = 0; i < bluetooth.needsCheckingQueue.length; i++) {
					if (bluetooth.needsCheckingQueue[i][0] == peripheralKey) {
						// Give us 10 seconds to try and find the device
						if (activePeripheral.lastConnectionTime < (common.currentDate() - 30)) {
							bluetooth.activePeripherals[peripheralKey].state = "stale";
						}
						return;
					}
				}

				// It wasn't in the needsChecking queue so add it in
				bluetooth.needsCheckingQueue.push([peripheralKey, activePeripheral]);

			} else if (activePeripheral.lastConnectionTime < (common.currentDate() - 60)) {
				common.printBLEMessage("Deleting " + peripheralKey + " at " + Date.now());

				// It's been over a minute since we connected to the peripheral, delete it from active
				delete bluetooth.activePeripherals[peripheralKey];
				bluetooth.removePeripheralFromChecking(peripheralKey);
			}
		}
		
	}
}, common.updateInterval);
