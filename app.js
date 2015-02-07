/**************************************************
 * Check state of wearables, reauth if necessary
 **************************************************/

// Modules
var common = require("./common.js");
var bluetooth = require("./bluetooth.js");
var socket = require("./socket.js");

setInterval(function(){

	common.printBLEMessage("Current active users: " + JSON.stringify(bluetooth.activePeripherals))
	common.printBLEMessage("Current stale users: " + JSON.stringify(bluetooth.needsCheckingQueue))

	if(!common.useMockData) {

		// Check each of the active peripherals
		for (var peripheralKey in bluetooth.activePeripherals) {

			// If we last saw the peripheral over 15s ago, but less than a minute
			if ((bluetooth.activePeripherals[peripheralKey]["lastConnectionTime"] < (common.currentDate() - 15000))
				&& bluetooth.activePeripherals[peripheralKey]["lastConnectionTime"] > (common.currentDate() - 60000)) {

				// Is it already in the needsChecking queue?
				for (var i = 0; i < bluetooth.needsCheckingQueue.length; i++) {
					if (bluetooth.needsCheckingQueue[i][0] == peripheralKey) {
						bluetooth.activePeripherals[peripheralKey]["state"] = "stale";
						return;
					}
				}

				// It wasn't in the needsChecking queue so add it in
				bluetooth.needsCheckingQueue.push([peripheralKey, bluetooth.activePeripherals[peripheralKey]])

			} else if (bluetooth.activePeripherals[peripheralKey]["lastConnectionTime"] < (common.currentDate() - 60000)) {
				common.printBLEMessage("Deleting " + peripheralKey + " at " + Date.now());

				// It's been over a minute since we connected to the peripheral, delete it from active
				delete bluetooth.activePeripherals[peripheralKey];
				bluetooth.removePeripheralFromChecking(peripheralKey);
			}
		}
	}
}, common.updateInterval);
