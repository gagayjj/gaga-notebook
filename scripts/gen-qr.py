import qrcode
from qrcode.constants import ERROR_CORRECT_M

URL = "https://gagayjj.github.io/gaga-notebook/"

qr = qrcode.QRCode(
    version=None,
    error_correction=ERROR_CORRECT_M,
    box_size=12,
    border=4,
)
qr.add_data(URL)
qr.make(fit=True)

img = qr.make_image(fill_color="#1f2933", back_color="#ffffff")
out = "public/phone-sync-qr.png"
img.save(out)
print("saved", out, img.size)
