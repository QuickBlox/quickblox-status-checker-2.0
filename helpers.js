var chance = require("chance").Chance(),
    moment = require("moment"),
    helpers = {},
    misc = {};

helpers.getLatency = function(ts) {
    var now = Date.now();
    return now-ts;
};

helpers.startTime = function() {
    return Date.now();
};

helpers.newName = function() {
    return chance.name().replace(/ /g, '_');
};

helpers.safeName = function(name) {
    return name.toLowerCase().replace(/ /g, '_');
};

helpers.camel = function(s) {
    return s.replace(/(\_[a-z])/g, function(str){return str.toUpperCase().replace('_','');});
};

helpers.formatNumber = function(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")
};

helpers.formatName = function(name) {
    return ( name.substr(0,1).toUpperCase() + name.substr(1) ).replace(/_/g, ' ');
};

helpers.time = function(format) {
    return moment().format(format);
};

helpers.rand = function(l) {
    return typeof l === "undefined" ? chance.natural() : chance.natural({ min: l[0], max: l[1] });
}

helpers.clone = function(object) {
    return JSON.parse(JSON.stringify(object));
};

helpers.getTemporaryInfo = function(module, field) {
    if(module && !field && misc[module]) {
        return misc[module];
    } else if (module && field && misc[module]) {
        if(misc[module][field]) {
            return misc[module][field]
        } else {
            return null;
        }
    } else {
        return null;
    }
};

helpers.setTemporaryInfo = function(module, record) {
    if(!module || !record) {
        return misc = {};
    } else {
        misc[module] = record;
    }
};

helpers.reset = function() {
    misc = {};
};

helpers.is = {
    object: function(a) {
        return (!!a) && (a.constructor === Object);
    },
    array: function(a) {
        return (!!a) && (a.constructor === Array);
    },
    undefined: function(a) {
        return a === void 0;
    }
};

module.exports = helpers;