/* Simulador para los gráficos de tipo 'mapeo' (Perilla).

   Implementa PerillaHardware (src/Hardware.h de Perilla) con una
   patita análoga simulada, y corre la Perilla de verdad: este archivo
   se compila junto a los .cpp de src/ de la versión publicada de la
   biblioteca.

   Argumentos: leidoMin leidoMax mapeadoMin mapeadoMax, que van a
   setRangoLeido() y setRangoMapeado().
   Por stdin recibe una línea "t lectura" por muestra; por cada una
   llama leer() y escribe por stdout "t getValor() getValorMapeado()".

   Lo compila y corre scripts/generar-graficos.js, no hace falta
   correrlo a mano.
*/
#include <cstdint>
#include <cstdio>
#include <cstdlib>

#include "Hardware.h"
#include "Perilla.h"

static uint16_t patitaSimulada = 0;

namespace PerillaHardware
{
    void configurarEntradaAnaloga(uint8_t) {}

    uint16_t leerPatita(uint8_t)
    {
        return patitaSimulada;
    }
}

int main(int argc, char **argv)
{
    if (argc != 5)
    {
        std::fprintf(stderr, "uso: %s leidoMin leidoMax mapeadoMin mapeadoMax\n", argv[0]);
        return 1;
    }

    Perilla perilla(26);
    perilla.setRangoLeido(std::atoi(argv[1]), std::atoi(argv[2]));
    perilla.setRangoMapeado(std::atoi(argv[3]), std::atoi(argv[4]));

    unsigned long t;
    unsigned int lectura;
    while (std::scanf("%lu %u", &t, &lectura) == 2)
    {
        patitaSimulada = lectura;
        perilla.leer();
        std::printf("%lu %u %u\n", t, perilla.getValor(), perilla.getValorMapeado());
    }
    return 0;
}
