const request = require('request');
const parseString = require('xml2js').parseString;
const ssdp = require('node-ssdp').Client
, client = new ssdp({})

class discover {
	constructor(that, log, foundReceivers, autoDiscoverTime) {
		this.foundReceivers = foundReceivers;

		client.on('notify', function () {
			log.error('Got a notification.')
		})
		
		var thisDiv = this;
		client.on('response', function inResponse(headers, code, rinfo) {
			let stringData = JSON.stringify(headers, null, '  ');
			if (stringData.match(/(d|D)enon/)) {
				let parseData = stringData.match(/"LOCATION": (.*?)(\d+\.\d+\.\d+\.\d+)(.*)/);
				let temp = parseData[0].split(/"/);

				let ipAddr = temp[3].replace("http://","");
				let colon = ipAddr.indexOf(":");
				ipAddr = ipAddr.substring(0,colon);

				let receiver = [];

				receiver.push(ipAddr);
				receiver.push(temp[3]);
				if (thisDiv.getIndexIP(ipAddr) == -1)
				{
					thisDiv.foundReceivers.push(receiver);
					thisDiv.retrieveDenonInformation(ipAddr, log);
					log.debug(ipAddr + ': ' + temp[3]);
				}
			}
		})
		client.search('upnp:rootdevice')

		/* Stop search client */
		setTimeout(function () {
			client.stop()
			for (let i in that.configReceivers) {
				let tempAcces = that.configReceivers[i]
				if (!tempAcces.getDevInfoSet()) {
					if (tempAcces.hasManualPort()) {
						log.info('No Denon receiver with IP: %s found in network. Using manual port: %s.', tempAcces.returnIP(), tempAcces.returnPort());
						tempAcces.setDevInfoSet(true);
					} else {
						tempAcces.setDisableReceiver(true);
						log.error('ERROR: No Denon receiver with IP: %s found in network. Check Denon network status or try setting a manual port.', tempAcces.returnIP());
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
				return this.foundReceivers[i][1];
		}
		return null;
	}

	retrieveDenonInformation(ipAddr, log) {
		var index = this.getIndexIP(ipAddr);

		var that = this;
		request(this.getInfoAddress(ipAddr), function(error, response, body) {
			if(error) {
				log.debug("Error while getting information of receiver with IP: %s. %s", that.foundReceivers[index][0], error);
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (err, result) {
					if(err) {
						log.debug("Error while parsing retrieveDenonInformation. %s", err);
					} else {
						try {
							try {
								that.foundReceivers[index][3] = result.root.device[0].manufacturer[0];
							} catch (error) {
								log.debug('Fault in manufacturer: %s.', result.root.device[0].manufacturer[0]);
								that.foundReceivers[index][3] = 'Denon';
							}
							try {
								that.foundReceivers[index][4] = (' ' + result.root.device[0].modelName[0]).slice(1);
							} catch (error) {
								log.debug('Fault in modelName: %s.', result.root.device[0].modelName[0]);
								that.foundReceivers[index][4] = 'homebridge-denon-heos';
							}
							try {
								that.foundReceivers[index][5] = result.root.device[0].serialNumber[0];
							} catch (error) {
								log.debug('Fault in serialNumber: %s.', result.root.device[0].serialNumber[0]);
								that.foundReceivers[index][5] = 'MVV123';
							}
							try {
								that.foundReceivers[index][2] = result.root.device[0].DMHX_WebAPIPort[0];
							} catch (error) {
								log.debug('Fault in DMHX_WebAPIPort: %s.', result.root.device[0].DMHX_WebAPIPort[0]);
							}

							for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++){
								try {
									that.foundReceivers[index][6] = result.root.device[0].deviceList[0].device[i].firmware_version[0];
									break;
								} catch (error) {
									that.foundReceivers[index][6] = '2.0.8';
								}
							}

							log('------------------------------');
							log('Receiver discovered in network:');
							log('IP Address: %s', that.foundReceivers[index][0]);
							log('Model: %s', that.foundReceivers[index][4]);
							log('Serialnumber: %s', that.foundReceivers[index][5]);
							log('Port: %s', that.foundReceivers[index][2]);
							log('------------------------------');
						} catch (error) {
							log.debug('Receiver with IP %s not ready.', ipAddr);
							log.debug(error);
						}
					}
				});
			}
		});
	}

	setDenonInformation(that, log) {	
		let index;
		if (!that.devInfoSet) {
			index = this.getIndexIP(that.ip);
			if (index == -1)
				return false
		} else {
			return true;
		}
		
		that.manufacturer = this.foundReceivers[index][3];
		that.modelName = this.foundReceivers[index][4];
		that.serialNumber = this.foundReceivers[index][5];
		that.firmwareRevision = this.foundReceivers[index][6];
		
		try {
			if(this.foundReceivers[index][2].includes('80') && !that.usesManualPort)
				that.webAPIPort = this.foundReceivers[index][2];
		} catch (error) {
			log.debug('Error in discovered port number Error: %s', error);
		}
	
		try {
			if(that.webAPIPort.includes('80'))
				that.devInfoSet = true;
			else {
				log.error('ERROR: Current port %s with ip: %s, is not suitable. Use 80 or 8080 manually instead.', this.webAPIPort, this.ip);
				process.exit(22);
			}
		} catch (error) {
			log.debug('Error in webAPIPort. Not a correct port. Error: %s', error);
		}
			
		return that.devInfoSet;
	}
}

module.exports = discover;