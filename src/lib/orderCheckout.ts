export type PaymentMethod = "cash" | "card" | "pix";

// Estado dos campos extras do checkout de delivery, vive em MesaCardapio e
// é só repassado (controlado) pro CartDrawer — mesmo padrão de
// customerName/tableLabel já usado ali.
export type DeliveryDetails = {
  addressText: string;
  selectedSavedAddressId: string | null; // null = está preenchendo endereço novo
  newAddressLabel: string; // nome opcional pro endereço novo (ex. "Casa"/"Trabalho")
  neighborhoodId: string;
  paymentMethod: PaymentMethod | null;
  wantsChange: boolean;
  changeFor: string;
};

export function emptyDeliveryDetails(): DeliveryDetails {
  return {
    addressText: "",
    selectedSavedAddressId: null,
    newAddressLabel: "",
    neighborhoodId: "",
    paymentMethod: null,
    wantsChange: false,
    changeFor: "",
  };
}
