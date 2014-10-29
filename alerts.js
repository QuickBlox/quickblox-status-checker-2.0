var fs = require('fs'),
    config = require('./config'),
    helpers = require('./helpers'),

    moment = require('moment'),
    nodemailer  = require('nodemailer'),
    sesTransport = require('nodemailer-ses-transport');

var transport = nodemailer.createTransport( sesTransport({
    accessKeyId: '',
    secretAccessKey: '',
    SeviceUrl: 'https://email.us-east-1.amazonaws.com'
}));

var template = "<h1>%INSTANCE% API Failure Alert<table><tbody>%REPORT%</tbody></table>";

function getInstance(instance, key) {
    var i, len = config.instances.length, index = -1;
    for(i = 0; i < len; ++i) {
        if(config.instances[i].name.toLowerCase() === instance.toLowerCase()) index = i;
    }
    return config.instances[index][key];
}

function composeEmail(instance, data, callback) {
    
    var html = "";
            
    html += '<tr><td colspan="3" style="font-weight: bold; border-bottom: 1px solid #F0F0F0; ">' + moment.utc().format("HH:mm") + ' UTC</td></tr>';
    
    var i, len = data.length;

    for(i = 0; i < len; ++i) {
        var msg = data[i];
        html += '<tr>' +
                   '<td width="30%">' + msg[0] + '</td>' +
                   '<td width="20%" style="color:' + (msg[1] === "Failed" ? "red" : "orange") + ';font-weight:bold;">' + msg[1] + '</td>' +
                   '<td width="50%" style="color:#999">' + msg[2] + '</td>' +
                 '</tr>';
    }
    
    fs.readFile('./templates/alert.html', function(error, email) {
        
        if(!error) {
            callback(email.toString().replace("%INSTANCE%", instance.toUpperCase()).replace("%REPORT%", html));
        } else {
            callback(email.replace("%INSTANCE%", instance.toUpperCase()).replace("%REPORT%", html));
        }
        
    });

}

function sendEmail(instance, html, callback) {
            
    if(!instance || !html) {
        return false;
    }
    
    var list = getInstance(instance, "email_alerts");
    
    transport.sendMail({
        from: 'Status Service <email@domain.com>',
        to: list,
        subject: instance.toUpperCase() + " - API failure report, " + moment.utc().format("ddd D MMM HH:mm:ss") + " UTC",
        html: html
    }, function(error, response) {
        if(!error){
            callback(null, response);
        } else {
            callback(error);
        }
    });
            
}

var sendAlert = function(instance, records, callback) {
    
    if(!instance || !records) {
    
        throw new Error("Necessary parameters were not supplied.");
    
    } else {
                
        var i, len = records.errors.length, errors = [];
        
        // Reorder ERRORS records array into just array of errors like:
        // [ ["module", "failed", "error"], ["module", "slow", "error"] ]
        
        for(i = 0; i < len; ++i) {
            var rec = records.errors[i];
            var err = [];
            if(typeof rec.module === "string") {
                err[i] = [rec.module, "Failed"];
                
                try {
                    if(typeof rec.details === "string") {
                        err[i][2] = rec.details;
                    } else if ( helpers.is.object(rec.details) ) {
                        err[i][2] = rec.details.code + " " + JSON.parse(rec.details.detail).errors[0];
                    } else {
                        err[i][2] = "Error could not be determined.";
                    }
                } catch(e) {
                    err[i][2] = "Error could not be determined.";
                }
                
                errors.push(err[i]);
            
            }

        }
        
        
        // Now to find the slow stats and add them to the array 
        Object.keys(records.latency).forEach(function(key) {
            var completion = records.latency[key];
            if(completion > 4000) {
                errors.push([helpers.formatName(key), "Slow", "Took " + helpers.formatNumber(records.latency[key]) + "ms to complete."]);
            }
        });
                
        composeEmail(instance, errors, function(html) {
            
            sendEmail(instance, html, callback);
            
        });
        
    }   
}

module.exports = sendAlert;