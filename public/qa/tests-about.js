suite('"About" Page Tests', function(req, res) {
	test('page should contain link to contact page', function() {
		assert($('a[href="/contact"]').length);
	});
});