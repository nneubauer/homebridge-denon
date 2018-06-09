var Service, Characteristic;
var request = require('request');
var parseString = require('xml2js').parseString;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-denon-avr', 'DenonAVR', denonClient);
};

function denonClient(log, config) {
  this.log = log;

  // configuration
  this.config = config;
  this.name = config['name'];
  this.ip = config['ip'];
  this.pollingInterval = 15000; //every 15 seconds

  this.requiredInput = config['requiredInput'] || false;
  this.debug = config['debug'] || false;

  // Start the polling loop. It will be started after a random interval between 0 and 15 seconds to make sure
  // we don't poll all switches at the same time.
  setTimeout(this.pollForUpdates, Math.random() * 15000, this);
}

/**
 * This will start a polling loop that goes on forever and updates
 * the on characteristic periodically.
 */
denonClient.prototype.pollForUpdates = function(that) {

  that.task_is_running = false;

  setInterval( function() {
    if(!that.task_is_running){
        that.task_is_running = true;
        that.getPowerState(function(error, result) {
          that.task_is_running = false;

          if(error) {
            that.log("Error while getting state %s", error)
          }
          else {
            if (that.homebridgeService) {
              //that.log("Updating remote change of state...")
              that.homebridgeService.getCharacteristic(Characteristic.On).updateValue(result);
            }
          }          
        });
    }
  }, that.pollingInterval);
}

denonClient.prototype.getPowerState = function (callback, context) {
  //this.log('getPowerState');
  var that = this;

  request('http://' + this.ip + ':8080/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
    if(error) {
      that.log("Error while getting power state %s", error);
      callback(null, false);
    }
    else {
      parseString(body, function (err, result) {
        if(error) {
          that.log("Error while parsing %s", err);
          callback(null, false);
        }
        else {
          //that.log("Got power state to be %s", result.item.Power[0].value[0]);
          //that.log("Got input state to be %s", result.item.InputFuncSelect[0].value[0]);
          
          //It is on if it is powered and the correct onput is selected.
          var isOn = ( result.item.Power[0].value[0] == 'ON' && result.item.InputFuncSelect[0].value[0] == that.requiredInput )
          callback(null, isOn);
        }
      });
    }
  });
};

denonClient.prototype.setPowerState = function (powerState, callback, context) {
  //this.log('setPowerState to: %s', powerState);
  var that = this;

  var stateString = (powerState ? 'On' : 'Standby');

  request('http://' + that.ip + ':8080/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
    if(error) {
      that.log("Error while getting power state %s", error);
      callback(error);
    }
    else if(powerState == true) {
      // Switch to correct input if switching on
      request('http://' + that.ip + ':8080/goform/formiPhoneAppDirect.xml?SI' + that.requiredInput, function(error, response, body) {
        if(error) {
          that.log("Error while switching input %s", error);
          callback(error);
        }
        else {
          callback();
        }
      });
    } else {
      //Switching off, just callback
      callback();
    }
  });
};

denonClient.prototype.getServices = function () {
  var informationService = new Service.AccessoryInformation();

  informationService
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, this.type || 'denon');

  // This is a switch that is on only if the avr is on && the input is correct.
  this.homebridgeService = new Service.Switch(this.name);
  this.homebridgeService.getCharacteristic(Characteristic.On)
    .on('get', this.getPowerState.bind(this))
    .on('set', this.setPowerState.bind(this));

  return [informationService, this.homebridgeService];
};