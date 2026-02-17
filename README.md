# Better-Vivaldi-PnP

> [!WARNING]
> **ARCHIVED REPO**  
> I archived this repo as I saw diminishing returns for the effort to keep this in sync with Foley's work versus the advancements and polish from Vivaldi's original PnP.

This mod was originally made by Micky Foley.
He first posted at [Vivaldi's forum](https://forum.vivaldi.net/topic/108624/a-user-friendly-enhancement-for-vivaldi-s-picture-in-picture-pip).

This is just a "mirror" to ease my own use on my system.

Install instructions:
1. Close Vivaldi completely.
1. Navigate into `[VIVALDI INSTALL DIRECTORY]\Application\[VERSION]\resources\vivaldi\components\picture-in-picture\` directory. On Windows, `[VIVALDI INSTALL DIRECTORY]` should be `C:\Program Files\Vivaldi`.
2. Rename `picture-in-picture.js` as `picture-in-picture.js.bkp` to create a backup of the original in case you want/need to revert.
3. Place the modified `picture-in-picture.js` from this gist.
4. Restart Vivaldi.

This needs to be repeated every time you update Vivaldi. A new Vivaldi version will always revert back to how it was.
