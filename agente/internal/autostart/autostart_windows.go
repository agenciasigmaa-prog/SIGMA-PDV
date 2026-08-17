//go:build windows

// Package autostart liga/desliga o início automático do agente ao logar no
// Windows, via a chave de registro Run do usuário atual — o mesmo efeito de
// um atalho na pasta Startup, sem precisar criar um arquivo .lnk (que
// exigiria COM/IShellLink). Isso roda na sessão interativa do usuário, não
// antes do login — é o que permite o ícone da bandeja existir. Um Serviço do
// Windows rodaria antes do login, mas sem acesso nenhum à área de trabalho,
// logo sem bandeja possível; por isso o agente não é um Serviço.
package autostart

import (
	"errors"
	"os"

	"golang.org/x/sys/windows/registry"
)

const runKeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`
const valueName = "ImpressoraPDVSigma"

// IsEnabled reflete o estado real da chave de registro — não guarda cache
// em memória, pra sempre bater com o que o Windows realmente vai fazer no
// próximo login.
func IsEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue(valueName)
	return err == nil
}

// SetEnabled cria ou remove a entrada. Usa o caminho do executável atual
// (os.Executable), então precisa ter sido chamado a partir do agente já
// copiado no lugar definitivo — mover o .exe depois quebra o autostart até
// a próxima vez que o usuário marcar a opção de novo.
func SetEnabled(enabled bool) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKeyPath, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	if !enabled {
		err := k.DeleteValue(valueName)
		if err != nil && !errors.Is(err, registry.ErrNotExist) {
			return err
		}
		return nil
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return k.SetStringValue(valueName, `"`+exe+`"`)
}
