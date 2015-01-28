// Libraries
var noble = require('noble');
var argv = require('yargs')
					.usage('Usage: $0')
					.describe('p', 'Print out the advertising packets')
					.describe('v', 'Be verbose about BLE events (not the advertising packets)')
					.argv;
// Constants
var userServiceUUID = "eb03a1e1663c414ea8126f8a94cdfb35";
var userCharacteristicUUID = "4a3c42c4de114357bfbef40d612c1ffc";
var nonceUUID = "0faba94acf64400289b66ce5088f18cb";
var keyUUID = "b09ef2475b9241678b9545d8193f7ea3";

// Variables
var userKey = "";
var activePeripherals = {};
var needsCheckingQueue = [];
var isScanning = false;
var locked = 0;

if (!Date.now) {
    Date.now = function() { return new Date().getTime(); }
}

// Check active devices are still around
setInterval(function(){

	console.log("Current active users: " + JSON.stringify(activePeripherals))
	console.log("Current stale users: " + JSON.stringify(needsCheckingQueue))

	for (var peripheralKey in activePeripherals) {

		if ( (activePeripherals[peripheralKey]["lastConnectionTime"] < (Date.now() - 15000)) && activePeripherals[peripheralKey]["lastConnectionTime"] > (Date.now() - 60000) ) {

			// Is it already in the queue?
			for (var i = 0; i < needsCheckingQueue.length; i++) {
				if (needsCheckingQueue[i][0] == peripheralKey) return;
			}

			needsCheckingQueue.push([peripheralKey, activePeripherals[peripheralKey]])
		}

		else if (activePeripherals[peripheralKey]["lastConnectionTime"] < (Date.now() - 60000)) {
			console.log("Deleting " + peripheralKey + " at " + Date.now());
			delete activePeripherals[peripheralKey];
			removePeripheralFromChecking(peripheralKey);
		}

	}

},5000);

function doesPeripheralNeedChecking(uuid) {
	for (var i = 0; i < needsCheckingQueue.length; i++) {
		if (needsCheckingQueue[i][0] == uuid) return 1;
	}

	return 0;
}

function removePeripheralFromChecking(uuid) {
	for (var i = 0; i < needsCheckingQueue.length; i++) {
		if (needsCheckingQueue[i][0] == uuid) needsCheckingQueue.splice(i, 1);
	}
}

function startScanning() {
	if (isScanning == false) {
		var serviceUUIDs = [userServiceUUID]; // default: [] => all
		var allowDuplicates = true; // default: false

		noble.startScanning(serviceUUIDs, allowDuplicates); // particular UUID's

		isScanning = true;
	}
}

function stopScanning() {
	if (isScanning == true) {
		noble.stopScanning();

		isScanning = false;
	}
}

function printBLEMessage(message)
{
	if (argv.v == true) {
		console.log(message);
	}
}

noble.on('stateChange', function(state) {
	printBLEMessage('on -> stateChange: ' + state);

	if (state === 'poweredOn') 
		startScanning();
	else 
		stopScanning();

});

noble.on('scanStart', function() {
	printBLEMessage('on -> scanStart');
});

noble.on('scanStop', function() {
	printBLEMessage('on -> scanStop');
});

noble.on('discover', function(peripheral) {

	if (argv.p == true) console.log('on -> discover: ' + peripheral);

	if (locked != 0) {
		return;
	} else {
		locked = 1;
	}

	// Only connect to a peripheral if it's not in activePeripherals or if it's in needsCheckingQueue 
	if ( (activePeripherals[peripheral["uuid"]] == undefined) || doesPeripheralNeedChecking(peripheral["uuid"]) ) {
	
		peripheral.once('connect', function() {
			printBLEMessage('on -> connect');
			this.updateRssi();
		});

		peripheral.once('disconnect', function() {

			for (var serviceID in peripheral["services"]) {
				var service = peripheral["services"][serviceID]
				if (service["uuid"] == userServiceUUID) {
					for (var characteristicID in service["characteristics"]) {
						characteristic = service["characteristics"][characteristicID];
						if (characteristic["uuid"] === userCharacteristicUUID) {
							//console.log("Deleting " + characteristic["_peripheralUuid"]);
							//delete activePeripherals[characteristic["_peripheralUuid"]];
						}
					}
				}
			}
			printBLEMessage('on -> disconnect');

			printBLEMessage("Start scanning again")
			startScanning();
		});

		peripheral.once('rssiUpdate', function(rssi) {
			printBLEMessage('on -> RSSI update ' + rssi);
			this.discoverServices();
		});

		peripheral.once('servicesDiscover', function(services) {
			for (var serviceID in services) {
				service = services[serviceID];
				if (service["uuid"] === userServiceUUID) {
					service.on('characteristicsDiscover', function(characteristics) {
						for (var characteristicID in characteristics) {
							characteristic = characteristics[characteristicID];
							if (characteristic["uuid"] === userCharacteristicUUID) {							
								characteristic.on('read', function(data, isNotification) {
									printBLEMessage('on -> characteristic read ' + data + ' ' + isNotification);

									var peripheralData = {
										name: data.toString(),
										lastConnectionTime: Date.now()
									}

									console.log("Found new user: " + peripheralData.name);

									activePeripherals[peripheral["uuid"]] = peripheralData;
									removePeripheralFromChecking(peripheral["uuid"]);
									console.log(activePeripherals)
								});

								characteristic.read();

							} else if (characteristic["uuid"] === nonceUUID) {
								characteristic.on('write', function() {
									printBLEMessage('on -> characteristic write ');
								});
								var nonceString = makeNonce();
								var nonceValue = new Buffer(nonceString, "utf-8");

								console.log("Sending Nonce " + nonceString);

								characteristic.write(nonceValue, function(err) {
									if (err) {
										printBLEMessage("Error writing value " + err);
									}
								});
							} else if (characteristic["uuid"] === keyUUID) {
								characteristic.notify(true, function(err) {
									if (err) {
										printBLEMessage("Error subscribing to notification " + err);
									}
								});

								characteristic.on('notify', function(state) {
									printBLEMessage('on -> characteristic notify ' + state);
									userKey = "";
								});

								characteristic.on('read', function(data, isNotification) {
									if (data.toString('hex') == "04") {
										console.log("Final user key: " + userKey);
										locked = 0;
										peripheral.disconnect();
									} else {
										userKey += data;
									}
								});					
							}
						}
					});
					service.discoverCharacteristics();
				}
			}
		});

		stopScanning();
		peripheral.connect(function(err) {
			if (err) {
				console.log(err);
			}
		});
	} else {
		locked = 0;
		startScanning();
	}
});

// http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
function makeNonce()
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}