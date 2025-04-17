from flask import render_template

def init_routes(app):
    @app.route('/')
    def InterfaceTransmissao():
        return render_template('radio.html')
