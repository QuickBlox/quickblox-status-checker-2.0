var fs 			= require('fs'),
	util		= require('util'),
	QB       	= require('quickblox'),
	cronJob		= require('cron').CronJob,
	moment 		= require("moment"),
	jade		= require('jade'),
	Check		= require('./check'),
	config	 	= require('./config'),
	express 	= require('express'),

	app 		= express(),
	memwatch 	= require('memwatch');

var port = 7828
	firstCheck = 1403686813;

app.listen(port);

app.use(function(req, res, next) {
	res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

console.log("Listening on %s", port);

new cronJob('00 0,10,20,30,40,50 0-23 * * *', function(){
    Check();
}, null, true);

require('nodetime').profile({
	accountKey: '',
	appName: 'Status checker server'
});

memwatch.on('leak', function(leak) {
	console.log("Leak detected.");
	console.log(leak);
	// bit paranoid
});

app.get('/', function(req, res){
	fs.readFile("./templates/status.html", function(error, file) {
		if(!error) {
			res.send(file.toString());
		} else {
			res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
		}
	});
});

app.get('/:status', function(req, res) {

	var filename = req.params.status;
	var time = moment(filename.substr(0, filename.length-5), "DDMMYY");

	if (filename.substr(-5, 5) === '.json') {
		var filename = filename.substr(0, filename.length-5);

		if(filename === "latest") {

			var options = {
				instance: "MyQuickbloxInstance",
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
						instance: "MyQuickbloxInstance",
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
								instance: "MyQuickbloxInstance",
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


	} else if (filename.length === 6 && time.isValid() && isNaN(filename) === false) {
		
		if(time.isAfter(moment()) || time.isBefore(firstCheck)) {
			res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
			return;
		} else {
			res.redirect(301, '/#' + filename);
			return;
		}
		
	} else {
		res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
		return;
	}

});

app.get('/files/:file', function(req, res){
	res.contentType(req.params.file);
	fs.stat("./files/"+req.params.file, function(error, stat) {
		if(!error) {
			fs.readFile("./files/"+req.params.file, function(error, file) {
				if(!error) {
					res.send(file.toString());
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
				res.send(file.toString());
			} else {
				res.status(500).set('Content-Type', 'text/html').end(errorPage(500));
			}
		});
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
					instance: instance,
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
					instance: instance,
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
		res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
	}

});

app.get('*', function(req, res) {
	res.status(404).set('Content-Type', 'text/html').end(errorPage(404));
});

function searchInstances(instance) {
	var len = config.instances.length;
	for(var i = 0; i < len; ++i) {
		if(instance.toLowerCase() === config.instances[i].name.toLowerCase()) {
			return config.instances[i].name;
		}
	}
	return false;
}

function getStatus(options, callback) {
	var CONFIG = config.status_app;
	QB.init(CONFIG.app_id, CONFIG.auth_key, CONFIG.auth_secret, false);
	QB.service.qbInst.config.endpoints.api = CONFIG.endpoint;
	QB.createSession(config.masterLogin, function(error, response){
		if(!error) {

			var params = {
				"sort_desc": "_id",
				"limit": 200,
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
