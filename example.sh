#!/bin/bash
#
# Example to click the <button id="run"> on the first 4 windows

export BUTTON="${1:-run}"

for a in {0..3}
do
	# This should rather be (but default argument rewriting is not implemented) so that we do not need the "export" above:
	# ff-marionette.js 0 list "ENV w $a"           'WIN @w@'            "find $BUTTON"                 'ENV e'       'click @e@'
	./ff-marionette.js 0 list "ENV w $a" 'WIN {"handle":@w@}' 'find {"value":"@BUTTON@","using":"id"}' 'ENV e' 'click {"id":@e@}'
	# ff-marionette.js 0        "WIN $a"                                "find $BUTTON"                 'ENV e'       'click @e@'
	# This is also which I'd like to see, because using WIN 0 to WIN n seems to be something natural.
	#
	# With a bit more default defaults, this could perhaps become:
	#
	# a=$a b=$BUTTON ff-marionette.js 0 'WIN @a@' 'find @b@' click
	#
	# Same as
	#
	# ff-marionette.js 0 "WIN $a" "find $BUTTON" click
done

