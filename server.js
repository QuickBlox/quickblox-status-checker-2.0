var fs          = require('fs'),
    util        = require('util'),
    QuickBlox   = require('quickblox'),
    cronJob     = require('cron').CronJob,
    moment      = require("moment"),
    Check       = require('./check'),
    config      = require('./config'),
    express     = require('express'),
    app         = express();

var QB = new QuickBlox();

var port = 7828,
    firstCheck = 1403686813,
    MAX_REQUESTS = 5,
    request_ips = {};

app.listen(port);

app.use(function(req, res, next) {
    res.set('Access-Control-Allow-Origin', '*');
    next();
});

console.log("Listening on %s", port);

new cronJob('00 0,5,10,15,20,25,30,35,40,45,50,55 0-23 * * *', function(){
    
    console.log("Running routine check.");
    
    var index = -1;
    
    var go = function() {
        new Check(config.instances[++index], null, function() {
            console.log("Completed for %s".green, config.instances[index].name);
            if(index !== config.instances.length - 1) go();
            else console.log("Completed for all instances.");
        });
    };
    
    go();
    
}, null, true);

new cronJob('00 * 0-23 * * *', function(){
    request_ips = {};
}, null, true);

function allowIP(ip) {
    if(typeof request_ips[ip] === "undefined") {
        request_ips[ip] = 1;
        return true;
    } else {
        if(request_ips[ip] >= MAX_REQUESTS) {
            console.log("Request from " + ip + " was denied.");
            return false;
        } else {
            request_ips[ip]++;
            return true;
        }
    }
}

app.get('/', function(req, res){
    res.set('Content-Type', 'text/html');
    fs.readFile("./templates/status.html", function(error, file) {
        if(!error) {
            res.send(file);
        } else {
            res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
        }
    });
});

app.post('/instances.json', function(req, res) {
    res.write("<html><body>");
    var interval = setInterval(function() {
        res.write("<h1>" + Date.now() + "</h1>")
    }, 1000);
    setTimeout(function() {
        clearInterval(interval);
        res.write("</body></html>");
        res.end();
    }, 10000);
});

app.get('/:status', function(req, res) {

    var filename = req.params.status;
    var time = moment(filename.substr(0, filename.length-5), "DDMMYY");

    if (filename.substr(-5, 5) === '.json') {
        var filename = filename.substr(0, filename.length-5);

        if(filename === "latest") {

            var options = {
                instance: "QuickbloxStarter",
                from: moment().subtract(24, "hours").subtract(2, "minutes").format("X"),
                until: moment().add(2, "minutes").format("X")
            };

            getStatus(options, function(error, response) {
                if(!error) {
                    res.json(response);
                } else {
                    res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
                }
            });

        } else if(filename.length === 6 && time.isValid() && time.isBefore(moment()) && !time.isBefore(moment(firstCheck, "X"))) {

            var path_to_file = "./cachedLogs/" + filename + ".json";

            fs.stat(path_to_file, function(error, stat) {
                if(error) {
                    var options = {
                        instance: "QuickbloxStarter",
                        from: time.format("X"),
                        until: time.add(1, "days").format("X")
                    };

                    getStatus(options, function(error, response) {
                        if(!error) {
                            res.json(response);
                            fs.writeFile(path_to_file, JSON.stringify(response), function(error) {
                                if(!error) console.log("Saved data to '%s' for cache", path_to_file);
                            });
                        } else {
                            res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
                        }
                    });
                    
                } else {
                
                    fs.readFile(path_to_file, { encoding: "utf8"}, function(error, file) {
                        if(file) {
                            res.set("Content-Type", "application/json");
                            res.send(file);
                            console.log("Loaded '%s' from cache", path_to_file)
                        } else {

                            var options = {
                                instance: "QuickbloxStarter",
                                from: time.format("X"),
                                until: time.add(1, "days").format("X")
                            };

                            getStatus(options, function(error, response) {
                                if(!error) {
                                    res.json(response);
                                    fs.writeFile(path_to_file, JSON.stringify(response), function(error) {
                                        if(!error) console.log("Saved data to '%s' for cache", path_to_file);
                                    });
                                } else {
                                    res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
                                }
                            });

                        }
                    });
                }
            });


        } else {
            res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
        }


    }
    else if (filename.length === 6 && time.isValid() && isNaN(filename) === false) {
        
        if(time.isAfter(moment()) || time.isBefore(firstCheck)) {
            res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
            return;
        } else {
            res.redirect(301, '/#' + filename);
            return;
        }
        
    }
    else if (filename === "ips") {
        res.json(request_ips);
    } else {
        res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
        return;
    }

});

app.get('/files/:file', function(req, res){
    res.contentType(req.params.file);
    fs.stat("./files/"+req.params.file, function(error, stat) {
        if(!error) {
            fs.readFile("./files/" + req.params.file, function(error, file) {
                if(!error) {
                    res.send(file);
                } else {
                    res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
                }
            });
        } else {
            res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
        }
    });
});

app.get('/instance/:instance', function(req, res){
    var instance = req.params.instance,
        time = moment(instance.substr(0, instance.length-5), "DDMMYY");
    
    if ( searchInstances(instance) ) {
        fs.readFile("./templates/status.html", function(error, file) {
            if(!error) {
                res.set('Content-Type', 'text/html').send(file);
            } else {
                res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
            }
        });
    } else {
        res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
    }
});

app.get('/now/:instance', function(req, res) {
    var param_name = req.params.instance || "",
        file_name = param_name.substr(0, param_name.length-5),
        instance = searchInstances(file_name);
    
    if( instance ) {
        if( allowIP(req.headers['x-forwarded-for']) ) {
            
            var now, callback;
            
            callback = function(data) {
                console.log("Ran test on %s for IP %s", instance.name, req.headers['x-forwarded-for']);
                var response = { instance: instance.name, latency: data.latency, error_log: data.errors, total: data.total };
                res.json(response);
                now = null;
            };
            
            now = new Check(instance, { quiet: true }, callback);
            
            req.on('close', function() {
                now.stop();
                console.log("Request cancelled");
            });
            
        } else {
            res.status(429).set('Content-Type', 'text/html').end(errorPage("Request limit exceeded"));
        }
    } else {
        res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
    }
});

app.get('/instance/:instance/:status', function(req, res) {
    var filename = req.params.status,
        reqinstance = req.params.instance,
        instance = searchInstances(reqinstance),
        time = moment(filename.substr(0, filename.length-5), "DDMMYY");
    
    if( instance ) {
        if (filename.substr(-5, 5) === '.json') {
            var filename = filename.substr(0, filename.length-5);
    
            if(filename === "latest") {
    
                var options = {
                    instance: instance.name,
                    from: moment().subtract(24, "hours").subtract(2, "minutes").format("X"),
                    until: moment().add(2, "minutes").format("X")
                };
    
                getStatus(options, function(error, response) {
                    if(!error) {
                        res.json(response);
                    } else {
                        res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
                    }
                });
    
            } else if(filename.length === 6 && time.isValid() && time.isBefore(moment()) && !time.isBefore(moment(firstCheck, "X"))) {
        
                var options = {
                    instance: instance.name,
                    from: time.format("X"),
                    until: time.add(1, "days").format("X")
                };
    
                getStatus(options, function(error, response) {
                    if(!error) {
                        res.json(response);
                    } else {
                        res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
                    }
                });
            }
        }
    } else {
        console.log(instance);
        res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
    }

});

app.get('*', function(req, res) {
    res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
});

function password(password) {
    return password === fs.readFileSync('./password', { "encoding" : "utf-8" });
}

function searchInstances(instance) {
    var len = config.instances.length, i;

    for(i = 0; i < len; ++i) {
        if(instance.toLowerCase() === config.instances[i].name.toLowerCase()) {
            return config.instances[i];
        }
    }

    return false;
}

function getStatus(options, callback) {
    var CONFIG = config.status_app;
    QB.init(CONFIG.app_id, CONFIG.auth_key, CONFIG.auth_secret, false);
    QB.service.qbInst.config.endpoints.api = CONFIG.endpoint;
    QB.createSession({login: "logbot", password: "logbot00"}, function(error, response){
        if(!error) {

            var params = {
                "sort_desc": "_id",
                "limit": 1000,
                "output[exclude]": "_id,_parent_id,user_id,updated_at,minutes,hours",
                "created_at[gte]": options.from,
                "created_at[lte]": options.until
            };

            QB.data.list(options.instance, params, function(error, status){
                if (error) {
                    callback(error);
                } else {
                                    
                    var params = {
                        "sort_desc": "_id",
                        "limit": 350,
                        "output[exclude]": "_id,_parent_id,user_id,updated_at,server",
                        "server": options.instance,
                        "created_at[gte]": options.from,
                        "created_at[lte]": options.until
                    };
                
                    QB.data.list("Push", params, function(error, push) {
                        if(!error) {
                            callback(null, {status: status.items, push: push.items});
                        } else {
                            callback(error);
                        }
                    });
                    
                }
            });

        } else {
            callback(error);
        }
    });
}

function errorPage(code) {
    return util.format('<!doctype html><html style="height:100%"><head><style type="text/css"></style></head><body style="height:100%;background:#F3F9FF;"><h1 style="font-family:sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-align:center;position:relative;top:25%;font-size:6em;color:#DAEEFF">%s</h1></body></html>', code);
}
