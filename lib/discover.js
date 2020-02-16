const request = require('request');
const parseString = require('xml2js').parseString;
const ssdp = require('node-ssdp').Client
, client = new ssdp({})

const mainFile = require('../index');

class discover {
	constructor(that, log, foundReceivers, autoDiscoverTime, pluginVersion) {
		this.foundReceivers = foundReceivers;

		client.on('notify', function () {
			log.error('Got a notification.')
		})
		
		var thisDiv = this;
		client.on('response', function inResponse(headers, code, rinfo) {
			let stringData = JSON.stringify(headers, null, '  ');
			if (stringData.match(/(d|D)enon/)) {
				// mainFile.logDebug('DEBUG: ' + stringData);
				let parseData = stringData.match(/"LOCATION": (.*?)(\d+\.\d+\.\d+\.\d+)(.*)/);
				let temp = parseData[0].split(/"/);

				let ipAddr = temp[3].replace("http://","");
				let colon = ipAddr.indexOf(":");
				ipAddr = ipAddr.substring(0,colon); 

				let receiver = [];

				receiver.push(ipAddr);
				receiver.push('0');
				receiver.push(temp[3]);
				receiver.push('Denon');
				receiver.push('homebridge-denon-heos');
				receiver.push('MVV123');
				receiver.push(pluginVersion);
				receiver.push(false);
				if (thisDiv.getIndexIP(ipAddr) == -1)
				{
					thisDiv.foundReceivers.push(receiver);
					thisDiv.retrieveDenonInformation(ipAddr, log);
					mainFile.logDebug('DEBUG: ' + ipAddr + ': ' + temp[3]);
				}
			}
		})
		client.search('ssdp:all')

		/* Stop search client */
		setTimeout(function () {
			client.stop()
			for (let i in that.configReceivers) {
				let tempAcces = that.configReceivers[i]
				if (!tempAcces.getDevInfoSet()) {
					if (tempAcces.hasManualPort()) {
						mainFile.logDebug('DEBUG: No Denon receiver with IP: ' + tempAcces.returnIP(), + ' found in network through auto-discovery. Using manual port: ' + tempAcces.returnPort());
						tempAcces.setDevInfoSet(true);
					} else {
						tempAcces.setDisableReceiver(true);
						log.error('ERROR: No Denon receiver with IP: ' + tempAcces.returnIP() + ' found in network through auto-discovery. Check Denon network status or try setting a manual port.');
					}
				}
			}
		}, autoDiscoverTime)
	}

	getIndexIP(ipAddr) {
		for (var i in this.foundReceivers) {
			if (this.foundReceivers[i].indexOf(ipAddr) != -1)
				return i;
		}
		return -1;
	}

	getInfoAddress(ipAddr) {
		for (var i in this.foundReceivers) {
			if (this.foundReceivers[i][0].indexOf(ipAddr) != -1)
				return this.foundReceivers[i][2];
		}
		return null;
	}

	retrieveDenonInformation(ipAddr, log) {
		var index = this.getIndexIP(ipAddr);

		var that = this;
		request(this.getInfoAddress(ipAddr), function(error, response, body) {
			if(error) {
				mainFile.logDebug("Error while getting information of receiver with IP: " + that.foundReceivers[index][0]);
				mainFile.logDebug('DEBUG: ' + error);
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (err, result) {
					if(err) {
						mainFile.logDebug("Error while parsing retrieveDenonInformation. " + err);
					} else {
						try {
							try {
								that.foundReceivers[index][3] = result.root.device[0].manufacturer[0];
							} catch (error) {
								mainFile.logDebug('DEBUG: Fault in manufacturer: ' + result.root.device[0].manufacturer[0]);
							}
							try {
								that.foundReceivers[index][4] = (' ' + result.root.device[0].modelName[0]).slice(1);
							} catch (error) {
								mainFile.logDebug('DEBUG: Fault in modelName: ' + result.root.device[0].modelName[0]);
							}
							try {
								that.foundReceivers[index][5] = result.root.device[0].serialNumber[0];
							} catch (error) {
								mainFile.logDebug('DEBUG: Fault in serialNumber: ' + result.root.device[0].serialNumber[0]);
							}
							try {
								that.foundReceivers[index][1] = result.root.device[0].DMHX_WebAPIPort[0];
							} catch (error) {
								mainFile.logDebug('DEBUG: No WebAPIPort found, use Telnet.');
							}

							try {
								for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++){
									try {
										that.foundReceivers[index][6] = result.root.device[0].deviceList[0].device[i].firmware_version[0];
										break;
									} catch (error) {
									}
								}
							} catch (error) {
								mainFile.logDebug('DEBUG: No Firmware version found.');
							}

							that.foundReceivers[index][7] = true; // set information retrieved to true

							log('------------------------------');
							log('Receiver discovered in network:');
							log('IP Address: %s', that.foundReceivers[index][0]);
							if (that.foundReceivers[index][1] != '0')
								log('Port: %s', that.foundReceivers[index][1]);
							log('Model: %s', that.foundReceivers[index][4]);
							log('Serialnumber: %s', that.foundReceivers[index][5]);
							log('Firmware: %s', that.foundReceivers[index][6]);
							log('------------------------------');
						} catch (error) {
							mainFile.logDebug('DEBUG: Receiver with IP ' + ipAddr + ' not ready.');
							mainFile.logDebug('DEBUG: ' + error);
						}
					}
				});
			}
		});
	}

	setDenonInformation(that, log) {
		mainFile.logDebug('DEBUG: setDenonInformation: ' + that.ip + '. Device info set: ' + that.devInfoSet);

		let index;
		if (that.devInfoSet) {
			return true;
		} else {
			index = this.getIndexIP(that.ip);
			if (index == -1)
				return false
			if (!this.foundReceivers[index][7])
				return false
		}
		
		that.manufacturer = this.foundReceivers[index][3];
		that.modelName = this.foundReceivers[index][4];
		that.serialNumber = this.foundReceivers[index][5];
		that.firmwareRevision = this.foundReceivers[index][6];
		
		that.devInfoSet = true;
		// try {
		// 	if(this.foundReceivers[index][1].includes('80') && !that.usesManualPort)
		// 		that.webAPIPort = this.foundReceivers[index][1];
		// } catch (error) {
		// 	mainFile.logDebug('DEBUG: Error in discovered port number Error: ' + error);
		// }
		
		// try {
		// 	if(that.webAPIPort.includes('80'))
		// 		that.devInfoSet = true;
		// 	else {
		// 		log.error('ERROR: Current port ' + this.webAPIPort + ' with ip: ' + this.ip + ', is not suitable. Use 80 or 8080 manually instead.');
		// 		process.exit(22);
		// 	}
		// } catch (error) {
		// 	mainFile.logDebug('DEBUG: Error in webAPIPort. Not a correct port. Error: ' + error);
		// }
		return true;
	}
}

module.exports = discover;