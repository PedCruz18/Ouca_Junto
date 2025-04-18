from flask import render_template

def init_routes(app):
    @app.route('/')
    def inicio():
        return render_template('inicio.html')
    
    @app.route('/radio')
    def radio():
        return render_template('radio.html')
    
    @app.route('/sobre')
    def sobre():
        return render_template('sobre.html')