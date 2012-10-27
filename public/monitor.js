$(document).ready(function() {
	var socket = io.connect(window.location.origin),
		collapseIndex = 0,
		$logPanel = $('#logs'),
		$categoryPanel = $('#categories');

	function addCategory(name) {
		var code;

		code = '<li id="category-' + name + '"><label class="checkbox"><input type="checkbox" checked="checked"> ' + name + '</label></li>';
		$categoryPanel.append(code);

		// Reorder
		var listitems = $categoryPanel.children('li').get();
		listitems.sort(function(a, b) {
			var compA = $('label', $(a)).text().toUpperCase();
			var compB = $('label', $(b)).text().toUpperCase();
			return (compA < compB) ? -1 : (compA > compB) ? 1 : 0;
		})
		$.each(listitems, function(idx, itm) {
			$categoryPanel.append(itm);
		});
	}

	function addLog(data) {
		var code,
			collapseId = 'collapse' + collapseIndex++;
		
		code = '<div class="accordion-group">';
		code += '<div class="accordion-heading">';
		code += '<a class="accordion-toggle" data-toggle="collapse" data-parent="#logs" href="#' + collapseId + '">' + data.msg + '</a>';
		code += '</div>';
		code += '<div id="' + collapseId + '" class="accordion-body collapse">';
		code += '<div class="accordion-inner">' + JSON.stringify(data) + '</div>';
		code += '</div></div>';

		$logPanel.prepend(code);
	}

	socket.on('log', function(data) {
		var $category = $('#category-' + data.meta.category);

		if ($category.length) {
			if (!$('input', $category).is(':checked')) {
				return; // Ignoring category
			}
		} else {
			addCategory(data.meta.category)
		}

		addLog(data);
	});
});
