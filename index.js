var Service, Characteristic;
var Denon = require('marantz-denon-telnet');

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

  this.requiredInput = config['input'] || false;
  this.debug = config['debug'] || false;

  // state variables
  this.avr = new Denon(this.ip);
  
}

denonClient.prototype.getPowerState = function (callback, context) {
  this.log('getPowerState');
  var that = this;

  this.avr.getPowerState(function(error, powerState) {
    if(error) {
      that.log("Error while getting power state %s", error);
    }

    if(powerState) {
      // if it is on, still have to check if input matches
      that.avr.getInput(function(error, input) {
        if(error) {
          that.log("Error while getting input state %s", error);
        }
  
        callback(null, powerState && input == that.requiredInput);
      });
    }
    else {
      //not powered on, means off no matter the input
      callback(null, powerState);
    }
  });
};

denonClient.prototype.setPowerState = function (powerState, callback, context) {
  this.log('setPowerState to: %s', powerState);
  var that = this;
  
  this.avr.setPowerState(powerState, function(error, data) {
    that.log('Sent power state to be %s', data);
    if(error) {
      that.log("Error while setting power state %s", error);
    }

    //Get input to check if it matches
    that.avr.getInput(function(error, input) {
      if(error) {
        that.log("Error while getting input state %s", error);
      }

      if(input != that.requiredInput) {
        //Switch input
        that.avr.setInput(that.requiredInput, function(error, data) {
          that.log('Sent input state to be %s', that.requiredInput);

          if(error) {
            that.log("Error while setting input state %s", error);
          }
          //return after switching input
          callback(null);
        });
      }
      else {
        //Return if input already matches
        callback(null);
      }
    });    
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