/* Simulador para los gráficos de tipo 'antirrebote' (Boton).

   Implementa BotonHardware (src/Hardware.h de Boton) con una patita y
   un reloj simulados, y corre el Boton de verdad: este archivo se
   compila junto a los .cpp de src/ de la versión publicada de la biblioteca.

   Por stdin recibe una línea "t lectura" por milisegundo (lectura es 0
   o 1); por cada una avanza el reloj, llama actualizar() y escribe por
   stdout "t lectura getValor()".

   Lo compila y corre scripts/generar-graficos.js, no hace falta
   correrlo a mano.
*/
#include <cstdint>
#include <cstdio>

#include "Boton.h"
#include "Hardware.h"

static uint32_t tiempoSimulado = 0;
static bool patitaSimulada = true;

namespace BotonHardware
{
    void configurarEntradaPullup(uint8_t) {}

    bool leerPatita(uint8_t)
    {
        return patitaSimulada;
    }

    uint32_t tiempoActual()
    {
        return tiempoSimulado;
    }
}

int main()
{
    Boton boton(2);

    unsigned long t;
    int lectura;
    while (std::scanf("%lu %d", &t, &lectura) == 2)
    {
        tiempoSimulado = t;
        patitaSimulada = lectura != 0;
        boton.actualizar();
        std::printf("%lu %d %d\n", t, lectura, boton.getValor() ? 1 : 0);
    }
    return 0;
}
