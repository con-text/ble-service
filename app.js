var noble = require('noble');
var userServiceUUID = "eb03a1e1663c414ea8126f8a94cdfb35";
var userCharacteristicUUID = "4a3c42c4de114357bfbef40d612c1ffc";
var nonceUUID = "0faba94acf64400289b66ce5088f18cb";
var keyUUID = "b09ef2475b9241678b9545d8193f7ea3";
var userKey = "";
var activePeripherals = {};

function startScanning() {
	var serviceUUIDs = [userServiceUUID]; // default: [] => all
	var allowDuplicates = false; // default: false

	noble.startScanning(serviceUUIDs, allowDuplicates); // particular UUID's
}

noble.on('stateChange', function(state) {
	console.log('on -> stateChange: ' + state);

	if (state === 'poweredOn') startScanning();
	else noble.stopScanning();

});

noble.on('scanStart', function() {
	console.log('on -> scanStart');
});

noble.on('scanStop', function() {
	console.log('on -> scanStop');
});

noble.on('discover', function(peripheral) {
	console.log('on -> discover: ' + peripheral);

	noble.stopScanning();

	peripheral.once('connect', function() {
		console.log('on -> connect');
		this.updateRssi();
	});

	peripheral.once('disconnect', function() {

		for (var serviceID in peripheral["services"]) {
			var service = peripheral["services"][serviceID]
			if (service["uuid"] == userServiceUUID) {
				for (var characteristicID in service["characteristics"]) {
					characteristic = service["characteristics"][characteristicID];
					if (characteristic["uuid"] === userCharacteristicUUID) {
						console.log("Deleting " + characteristic["_peripheralUuid"]);
						console.log(activePeripherals);
						delete activePeripherals[characteristic["_peripheralUuid"]];
						console.log(activePeripherals);
					}
				}
			}
		}

		console.log('on -> disconnect');

		console.log("Start scanning again")
		startScanning();
	});

	peripheral.once('rssiUpdate', function(rssi) {
		console.log('on -> RSSI update ' + rssi);
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
								console.log('on -> characteristic read ' + data + ' ' + isNotification);
								activePeripherals[peripheral["uuid"]] = data;
								console.log(activePeripherals)
							});

							characteristic.read();

						} else if (characteristic["uuid"] === nonceUUID) {
							characteristic.on('write', function() {
								console.log('on -> characteristic write ');
							});
							var nonceString = makeNonce();
							var nonceValue = new Buffer(nonceString, "utf-8");

							console.log("Sending Nonce " + nonceString);

							characteristic.write(nonceValue, function(err) {
								if (err) {
									console.log("Error writing value " + err);
								}
							});
						} else if (characteristic["uuid"] === keyUUID) {
							characteristic.notify(true, function(err) {
								if (err) {
									console.log("Error subscribing to notification " + err);
								}
							});

							characteristic.on('notify', function(state) {
								console.log('on -> characteristic notify ' + state);
								userKey = "";
							});

							characteristic.on('read', function(data, isNotification) {
								if (data.toString('hex') == "04") {
									console.log("Final user key: " + userKey);
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

	peripheral.connect();
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