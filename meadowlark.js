var express = require('express');
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var app = express();
var jqupload = require('jquery-file-upload-middleware');

// set up handlebars view engine
var handlebars = require('express3-handlebars').create({ defaultLayout:'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

// use the 'static' middleware that is provided with express
app.use(express.static(__dirname + '/public'));

// define middleware to conditionally show tests
app.use(function(req, res, next) {
	res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
	next();
});

app.use(function(req, res, next) {
	if(!res.locals.partials) res.locals.partials = {};
	res.locals.partials.weather = getWeatherData();
	next();
});

app.use(require('body-parser')());

// routes:
app.get('/', function(req, res) {
  res.render('home');
});

app.get('/about', function(req, res) {
  res.render('about', { fortune: fortune() , pageTestScript: '/qa/tests-about.js' });
});

app.get('/newsletter', function(req, res) {
	res.render('newsletter', { csrf: 'CSRF token goes here' });
});

app.post('/process', function(req, res) {
	if(req.xhr || req.accepts('json,html') === 'json') {
		// if there were an error, we would send { error: 'description' }
		res.send({ success: true });
	} else {
		console.log('Form (from querystring):', req.query.form);
		console.log('CSRF token (from hidden form field):', req.body._csrf);
		console.log('Email (from visible form field):', req.body.email);
		res.redirect(303, '/thank-you');
	}
});

app.get('/contest/vacation-photo', function(req, res) {
	var now = new Date();
	res.render('contest/vacation-photo', { year: now.getFullYear(), month: now.getMonth() });
});

app.post('/contest/vacation-photo/:year/:month', function(req, res) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		if(err) return res.redirect(303, '/error');
		console.log('received fields:');
		console.log(fields);
		console.log('received files:');
		console.log(files);
		res.redirect(303, '/thank-you');
	});
});

// jquery file upload

app.get('/contest/funny-photo', function(req, res) {
  res.render('contest/funny-photo');
});

app.use('/upload', function(req, res, next) {
  var now = Date.now();
  jqupload.fileHandler({
    uploadDir: function() {
      return __dirname + '/public/uploads/' + now;
    },
    uploadUrl: function() {
      return '/uploads/' + now;
    }
  })(req, res, next);
});

// custom 404 page
app.use(function(req, res) {
  res.status(404);
  res.render('404');
});

// custom 500 page
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.type('text/plain');
  res.status(500);
  res.send('500 - Server Error');
});

app.listen(app.get('port'), function() {
  console.log('Express started on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
});

function getWeatherData() {
	return {
		locations: [
			{
				name: 'Portland',
				forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
				weather: 'Overcast',
				temp: '54.1 F (12.3 C)'
			},
			{
				name: 'Bend',
				forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
				weather: 'Partly Cloudy',
				temp: '55.0 F (12.8 C)'
			},
			{
				name: 'Manzanita',
				forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
				iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
				weather: 'Partly Cloudy',
				temp: '55.0 F (12.8 C)'
			}
		]
	};
}