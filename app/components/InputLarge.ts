import styled from "styled-components";
import Input from "./Input";

const InputLarge = styled(Input)`
  height: 38px;
  flex-grow: 1;
  width: 100%;
  margin-right: 0;

  input {
    height: 38px;
  }
`;

export default InputLarge;
