var raw_data,
	errors,
	records,
	push_notifications,
	charts = {},
	picker = new Pikaday({
		field: document.getElementById("datepicker"),
		container: document.getElementById("datepicker"),
		defaultDate: moment().toDate(),
		minDate: moment(1403773213000).toDate(),
		maxDate: moment().toDate(),
		bound: false
	});

window.onhashchange = function() {

	$("[data-module]").each(function() {
		var element = $(this);
		element.removeClass("open");
		element.addClass("closing");
		setTimeout(function() {
			element.removeClass("closing");
		}, 500);
	});

	Object.keys(charts).forEach(function(key) {
		console.log(key);
		charts[key].destroy()
		delete charts[key];
	});

	init();
};

var chartOptions = {
	textColor: "rgba(255, 255, 255, 0.8)",
	lineColor: "rgba(255, 255, 255, 0.1)",
	plotColor: "rgba(255, 255, 255, 0.4)",
	dataColor: "rgba(255, 255, 255, 1)",
	transparent: "rgba(255, 255, 255, 0)"
};

$(document).ready(function(){

	init();

	if(location.pathname !== "/" && location.pathname !== "") {
		var path = location.pathname.split("/");
		$(".instance_name").text(path[path.length-1] + " report");
	} else {
		$(".instance_name").text("Free tier report");
	}

	$("#load_new_data").click(function(){
		var time = picker.toString("DDMMYY");
		if(time !== moment().format("DDMMYY")) {
			location.hash = time;
		} else {
			location.hash = "";
		}
		$("#timemachine, body").removeClass("datepicker-open");
	});

	$("#load_latest").click(function() {
		$("#timemachine, body").removeClass("datepicker-open");
		picker.setDate(moment().toDate());
		location.hash = "";
	});

	$("#lastchecked, #exit_datepicker").click(function() {
		$("#timemachine, body").toggleClass("datepicker-open");
	});

	$("[data-open-graph]").click(function() {
		var graph_to_open = $(this).attr("data-open-graph"),
			selector = "[data-module=" + graph_to_open + "]"
		if($(selector).hasClass("open")) {
			try{
				charts[graph_to_open].destroy();
				delete charts[graph_to_open];
			} catch(e) {}
			$(selector).removeClass("open");
			$(selector).addClass("closing");
			setTimeout(function() {$(selector).removeClass("closing"); try{charts[graph_to_open].destroy()}catch(e){}}, 500);
		} else {
			$(selector).addClass("open");
			setTimeout(function(){
				graphModule(graph_to_open);
			}, 500);
		}
	});

});

function init() {
	var recordsToGet = whatsTheTime();
	switchOffTheLights();
	getStatus(recordsToGet, function(data){
		records = parseLogs(data);
		if(recordsToGet === "latest") {
			showStatus(records[0], true);
		} else {
			showStatus(records[records.length-1], false);
		}
	});
}

function getStatus(date, callback) {
	var instance,
		path = location.pathname;
	if(path.length > 1) path = path.split("/");

	if(path[path.length-1].length > 1) instance = "/instance/" + path[path.length-1] + "/";
	else instance = "/";

	var success = function(data) {
		raw_data = data.status;
		errors = ( raw_data[0].errors !== null ? JSON.parse(raw_data[0].errors) : false );
		push_notifications = data.push;
		callback(data.status);
	};

	var error = function(error){
		showMessage("Stats could not be retrieved for this date. Resorting to latest...")
	};

	$.ajax({ url: "http://status.quickblox.com" + instance + date + ".json", method: "GET", dataType: "json", success: success, error: error });
}

function whatsTheTime() {
	var hash = window.location.hash;
	if (hash === "#" || hash === "") {
		return "latest";
	} else if (hash.length === 7 && !isNaN( hash.replace("#","") ) ) {
		picker.setDate(moment(hash.replace("#", ""), "DDMMYY").toDate());
		return hash.replace("#", "");
	} else {
		showMessage("Showing latest records.")
		return "latest";
	}
}

function switchOffTheLights() {
	$(".time").each(function() {
	    $(this).removeClass("pass failed slow disabled not-applicable").html("<span class='time-loading'>&middot; &middot; &middot;</span>")
	});
}

function showStatus(logs, isLatest) {
	logs = JSON.parse(JSON.stringify(logs)); // LOGS IS CONNECTED TO THE GLOBAL FUCKING RECORDS OBJECT WTF WHY
	if(push_notifications[0] && push_notifications[0].delivery) logs["receive_push"] = push_notifications[0].delivery;
	Object.keys(logs).forEach(function(module) {
		if(logs.hasOwnProperty(module)) {
			var element = "#" + module + " .time",
				time = logs[module];
	
			var result = "pass";
			if(time === 0) result = "failed";
			else if (time > 2500) result = "slow";
			else if(time === -1) result = "disabled";
	
			$(element).addClass(result);
			$(element).html((time !== -1 && time !== 0 ? logs[module] + (module !== "receive_push" ? "ms" : " sec") : result));
			
			$(".time").not(".pass, .slow, .failed, .disabled").each(function() {
				$(this).html('<span class="not-applicable">N/A</span>');
			});
			
			if(result === "failed") {
				$(element).attr("title", getError(module));
			}
		}
	});
	if(isLatest) {
		$("#lastchecked").text("Last checked " + moment.utc(logs.created_at, "X").fromNow());
	} else {
		$("#lastchecked").text("Showing status for " + moment.utc(logs.created_at, "X").format("ddd DD MMM YYYY"));
	}
	$(".loading").css("opacity", "0");
	setTimeout(function() { $(".loading").css("display", "none"); }, 250)
}

function getError(module) {
	if(errors) {
		module = module.replace(/_/g, " ").toLowerCase();
		var errors_length = errors.length;
		for(var i = 0; i < errors_length; ++i) {
			if(errors[i].module.toLowerCase() === module) {
				return errors[i].details;
			}
		}
		return "Unknown error";
	}
}
function parseLogs(data) {
	// data will be response.items[]
	var logObject = [],
		dataLen = data.length;
	for(var i = 0; i < dataLen; ++i) {
		logObject[i] = JSON.parse( data[i].logs );
		logObject[i].created_at = data[i].created_at;
	}
	return logObject;
}
function getGraphData(module) {
	// module will be string from logs, e.g. "create_session"
	// records will be logs = [{ create_session: ... }, {}]
	if(records[0].hasOwnProperty(module)) {
		var moduleData = [],
			dataLen = records.length;
		for(var i = 0; i < dataLen; ++i) {
			if(records[i].hasOwnProperty(module)) {
				var dateObj = records[i].created_at * 1000; // JS -> Epoch
				var dataPoint = [ dateObj, records[i][module] ]
				moduleData[i] = dataPoint; //dataPoint;
			}
	    }
	    return { min: records[0].created_at, max: records[dataLen-1].created_at, series: moduleData.reverse() };
    } else if (module === "receive_push") {
    	if(push_notifications.length > 0) {
		    var moduleData = [],
				dataLen = push_notifications.length;
			for(var i = 0; i < dataLen; ++i) {
				var dateObj = push_notifications[i].created_at * 1000; // JS -> Epoch
				var dataPoint = [ dateObj, push_notifications[i].delivery ]
				moduleData[i] = dataPoint; //dataPoint;
		    }
		    return { min: push_notifications[0].created_at, max: push_notifications[dataLen-1].created_at, series: moduleData.reverse() };
		} else {
			return undefined;
		} 
    }
}
function convertCamelCase(string) {
	return string.replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase(); }).trim();
}
function showMessage(message) {
	var element = $("<div id='modalMessage'></div>");
	$("body").addClass("modalopen").append(element);
	element.html(message);
	setTimeout(function(){element.remove(); $("body").removeClass("modalopen"); location.hash = ""}, 2000);
}
function graphModule(module) {
	var plotData = getGraphData(module);

	charts[module] = new Highcharts.Chart({
	  chart: {
	    style: { fontFamily: "'proxima-nova', Proxima Nova, Open Sans, Helvetica Neue, Helvetica, sans-serif", fontSize: '12px', color: chartOptions.textColor },
        type: "spline",
        backgroundColor: chartOptions.transparent,
        borderRadius: 0,
        renderTo: document.querySelector("[data-module=" + module + "] .graph")
      },
      title: { text: null },
      legend: { enabled: false },
      credits: { enabled: false },
      colors: [ chartOptions.dataColor ],
      xAxis: { title: { text: null, },
        gridLineColor: chartOptions.lineColor,
        lineColor: chartOptions.lineColor,
        tickColor: chartOptions.lineColor,
        offset: 0,
        type: "datetime",
        labels : { style: { color: chartOptions.textColor } }
      },
      yAxis: {
        min: 0,
        gridLineColor: chartOptions.plotColor,
        title: { text: null },
        plotLines: [{ value: 0, width: 1, color: chartOptions.transparent }],
        labels: { format: '{value}' + (module !== "receive_push" ? 'ms' : 's'), style: { color: chartOptions.textColor } }
      },
      noData: { style: { "fontSize": "18px", "fontWeight": "300" } },
      plotOptions: {
        spline: {
          lineWidth: 2,
          states: { hover: { lineWidth: 2 } },
          animation: false,
          marker: { radius: 0, symbol: "circle", states: { hover: { fillColor: chartOptions.lineColor, radius: 2 } } },
        }
      },
      legend: { enabled: false },
      tooltip: {
        valueSuffix: 'ms',
        tooltip: true,
        headerFormat: "",
        shadow: false,
        useHTML: true,
        backgroundColor: "rgba(255,255,255,.95)",
        borderColor: "#B4B4B4",
        borderWidth: 1,
        borderRadius: 5,
        formatter: function() {
          if(this.y > 0)
          return  '<h5>' + moment.utc(this.x).format("HH:mm A") + '</h5><span class="tooltip-latency">' + this.y + '<small>' + (module !== "receive_push" ? 'ms' : ' sec') + '</small></span>';
          else if (this.y < 0)
          return  '<h5>' + moment.utc(this.x).format("HH:mm A") + '</h5><span class="tooltip-latency">Disabled</span>';
          else
          return '<h5>' + moment.utc(this.x).format("HH:mm A") + '</h5><span class="tooltip-latency">Failed</span>';
        }
      },
      series: [{
        name: module.charAt(0).toUpperCase() + module.slice(1),
        data: (typeof plotData !== "undefined" ? plotData.series : null),
        pointInterval: 6, // 10 minutes
		pointStart: (typeof plotData !== "undefined" ? plotData.min : null)
      }]
    });
}